import time
from datetime import datetime
import socket
import base64
import ssl
from flask import Blueprint, render_template, request, redirect, url_for, flash, session, jsonify
from database import get_connection
from datetime import datetime, time
import logging
from contextlib import closing
import os
from werkzeug.utils import secure_filename
import cv2
import numpy as np
import smtplib
from email.message import EmailMessage

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

visitor_bp = Blueprint('visitor', __name__, template_folder='templates', url_prefix='/visitor')

# Configuration
UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg'}

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def detect_qr_code(image_path):
    """Detect QR codes using OpenCV"""
    img = cv2.imread(image_path)
    detector = cv2.QRCodeDetector()
    data, _, _ = detector.detectAndDecode(img)
    return data if data else None

@visitor_bp.route('/login', methods=['GET', 'POST'])
def visitor_login():
    if request.method == 'POST':
        user_id = request.form.get('userid', '').strip()
        password = request.form.get('password', '').strip()

        logger.info(f"Login attempt for User ID: {user_id}")

        if not user_id or not password:
            flash("User ID and Password are required.", "danger")
            return redirect(url_for('visitor.visitor_login'))

        try:
            with closing(get_connection()) as conn:
                if conn is None:
                    flash("Database connection failed. Please try again later.", "danger")
                    return redirect(url_for('visitor.visitor_login'))

                with conn.cursor() as cursor:
                    cursor.execute("""
                        SELECT UserID
                        FROM tblGlobalUserMaster
                        WHERE LOWER(UserID) = LOWER(?) AND Password = ?
                    """, (user_id, password))
                    user = cursor.fetchone()

                    if not user:
                        flash("Invalid User ID or Password.", "danger")
                        return redirect(url_for('visitor.visitor_login'))

                    session['user_id'] = user_id
                    return redirect(url_for('visitor.home'))

        except Exception as e:
            logger.error(f"Error during login: {str(e)}", exc_info=True)
            flash("An error occurred while verifying credentials.", "danger")
            return redirect(url_for('visitor.visitor_login'))

    return render_template('visitor/login.html')

@visitor_bp.route('/')
def home():
    if 'user_id' not in session:
        return redirect(url_for('visitor.visitor_login'))
    return render_template('visitor/home.html', username=session['user_id'])

@visitor_bp.route('/api/save_visitor', methods=['POST'])
def save_visitor():
    if 'user_id' not in session:
        return jsonify({"success": False, "message": "Unauthorized"}), 401

    try:
        # Get form data
        phone = request.form.get('phone', '').strip()
        name = request.form.get('name', '').strip()
        id_card_no = request.form.get('idCardNo', '').strip()
        address = request.form.get('address', '').strip()
        tab_serial = request.form.get('tabSerial', '').strip()
        laptop_serial = request.form.get('laptopSerial', '').strip()
        pendrive = request.form.get('pendrive', '').strip()
        person_to_meet = request.form.get('personToMeet', '').strip()
        purpose = request.form.get('purpose', '').strip()
        in_time = request.form.get('inTime', '').strip()
        out_time = request.form.get('outTime', '').strip()
        remarks = request.form.get('remarks', '').strip()
        
        # Handle other purpose
        if purpose == 'other':
            other_purpose = request.form.get('otherPurpose', '').strip()
            if not other_purpose:
                return jsonify({"success": False, "message": "Please specify the purpose."}), 400
            purpose = other_purpose

        # Handle photo upload
        photo = None
        if 'photo' in request.files:
            file = request.files['photo']
            if file and file.filename != '':
                photo = file.read()

        # Validate required fields
        required_fields = {
            'phone': phone,
            'name': name,
            'person_to_meet': person_to_meet,
            'purpose': purpose,
            'in_time': in_time
        }
        
        missing_fields = [field for field, value in required_fields.items() if not value]
        if missing_fields:
            return jsonify({
                "success": False,
                "message": f"Missing required fields: {', '.join(missing_fields)}"
            }), 400

        # Parse datetime
        today = datetime.now().date()
        try:
            in_time_dt = datetime.strptime(f"{today} {in_time}", '%Y-%m-%d %I:%M %p')
            out_time_dt = datetime.strptime(f"{today} {out_time}", '%Y-%m-%d %I:%M %p') if out_time else None
        except ValueError as e:
            return jsonify({
                "success": False,
                "message": f"Invalid time format: {str(e)}"
            }), 400

        # Save to database
        try:
            with closing(get_connection()) as conn:
                with conn.cursor() as cursor:
                    cursor.execute("""
                        INSERT INTO VisitorManagement (
                            Phone, Name, IDCardNo, Address, TabSerial, LaptopSerial, 
                            Pendrive, PersonToMeet, Purpose, InTime, OutTime, 
                            Remarks, Photo
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        phone, name, id_card_no, address, tab_serial, laptop_serial,
                        pendrive, person_to_meet, purpose, in_time_dt, out_time_dt,
                        remarks, photo
                    ))
                    conn.commit()

                    # Get recipient email
                    cursor.execute("""
                        SELECT MailID FROM tblGlobalUserMaster WHERE Username = ?
                    """, (person_to_meet,))
                    row = cursor.fetchone()
                    recipient_email = row[0] if row else None
        except Exception as db_error:
            logger.error(f"Database error: {str(db_error)}", exc_info=True)
            return jsonify({
                "success": False,
                "message": "Database operation failed"
            }), 500

        # Send email if recipient found
        if recipient_email:
            try:
                # SMTP Configuration
                smtp_config = {
                    'server': "smtp.gmail.com",
                    'port': 587,  # Primary port with STARTTLS
                    'username': "salzer2mis2019@gmail.com",
                    'password': "gzljkoroeotcxfov",
                    'timeout': 30
                }

                # Create email message
                msg = EmailMessage()
                msg['From'] = smtp_config['username']
                msg['To'] = recipient_email
                msg['Subject'] = f"New Visitor Notification: {name}"

                # Email content
                email_content = f"""
                <html>
                    <body>
                        <h2>New Visitor Registered</h2>
                        <p><strong>Visitor Name:</strong> {name}</p>
                        <p><strong>Phone:</strong> {phone}</p>
                        <p><strong>Meeting:</strong> {person_to_meet}</p>
                        <p><strong>Purpose:</strong> {purpose}</p>
                        <p><strong>Time:</strong> {in_time}</p>
                        <p><strong>ID Card:</strong> {id_card_no if id_card_no else 'Not provided'}</p>
                    </body>
                </html>
                """
                msg.set_content(email_content, subtype='html')

                # Attach photo if available
                if photo:
                    msg.add_attachment(
                        photo,
                        maintype='image',
                        subtype='jpeg',
                        filename='visitor_photo.jpg'
                    )

                # Attempt to send email with retries
                max_attempts = 3
                for attempt in range(1, max_attempts + 1):
                    try:
                        context = ssl.create_default_context()
                        
                        # Try STARTTLS first
                        with smtplib.SMTP(smtp_config['server'], smtp_config['port'], 
                                        timeout=smtp_config['timeout']) as server:
                            server.ehlo()
                            server.starttls(context=context)
                            server.ehlo()
                            server.login(smtp_config['username'], smtp_config['password'])
                            server.send_message(msg)
                            logger.info(f"Email sent successfully (attempt {attempt})")
                            break
                            
                    except (smtplib.SMTPException, socket.timeout, ConnectionError) as e:
                        logger.warning(f"Email attempt {attempt} failed: {str(e)}")
                        if attempt < max_attempts:
                            time.sleep(2)  # Wait before retrying
                        continue
                    except Exception as e:
                        logger.error(f"Unexpected email error: {str(e)}")
                        raise
                else:
                    raise Exception(f"Failed to send email after {max_attempts} attempts")

            except Exception as email_error:
                logger.error(f"Email sending failed: {str(email_error)}", exc_info=True)
                return jsonify({
                    "success": True,
                    "message": "Visitor saved but email notification failed"
                })

        return jsonify({
            "success": True,
            "message": "Visitor saved successfully"
        })

    except Exception as e:
        logger.error(f"Unexpected error saving visitor: {str(e)}", exc_info=True)
        return jsonify({
            "success": False,
            "message": "An unexpected error occurred"
        }), 500

@visitor_bp.route('/api/get_visitors', methods=['GET'])
def get_visitors():
    if 'user_id' not in session:
        return jsonify({"success": False, "message": "Unauthorized"}), 401

    try:
        from_date = request.args.get('from')
        to_date = request.args.get('to')
        search_term = request.args.get('search', '').lower()
        
        with closing(get_connection()) as conn:
            with conn.cursor() as cursor:
                cursor.execute("""
                    SELECT 
                        VisitorID, 
                        ISNULL(Phone, '') as Phone,
                        ISNULL(Name, '') as Name,
                        ISNULL(Address, '') as Address,
                        ISNULL(IdCardNo, '') as IdCardNo,
                        ISNULL(TabSerial, '') as TabSerial,
                        ISNULL(LaptopSerial, '') as LaptopSerial,
                        ISNULL(Pendrive, '') as Pendrive,
                        ISNULL(PersonToMeet, '') as PersonToMeet,
                        ISNULL(Purpose, '') as Purpose,
                        CONVERT(varchar, InTime, 120) as InTime,
                        CONVERT(varchar, OutTime, 120) as OutTime,
                        Photo,
                        ISNULL(Remarks, '') as Remarks
                    FROM VisitorManagement
                    WHERE 1=1
                """ + 
                (" AND CONVERT(date, InTime) >= ?" if from_date else "") + 
                (" AND CONVERT(date, InTime) <= ?" if to_date else "") + 
                " ORDER BY InTime DESC",
                ([from_date] if from_date else []) + ([to_date] if to_date else []))
                
                visitors = []
                for row in cursor.fetchall():
                    visitor = {
                        "VisitorID": row[0],
                        "Phone": row[1],
                        "Name": row[2],
                        "Address": row[3],
                        "IdCardNo": row[4],
                        "TabSerial": row[5],
                        "LaptopSerial": row[6],
                        "Pendrive": row[7],
                        "PersonToMeet": row[8],
                        "Purpose": row[9],
                        "InTime": row[10],
                        "OutTime": row[11],
                        "Remarks": row[13]
                    }
                    
                    if row[12]:
                        visitor["PhotoBase64"] = base64.b64encode(row[12]).decode('utf-8')
                    
                    if not search_term or (
                        search_term in visitor["Name"].lower() or 
                        search_term in visitor["Phone"].lower()
                    ):
                        visitors.append(visitor)

                return jsonify({
                    "success": True,
                    "visitors": visitors,
                    "count": len(visitors)
                })

    except Exception as e:
        logger.error(f"Error fetching visitors: {str(e)}", exc_info=True)
        return jsonify({
            "success": False,
            "message": str(e),
            "error": "Database operation failed"
        }), 500
        
@visitor_bp.route('/api/update_out_time', methods=['POST'])
def update_out_time():
    if 'user_id' not in session:
        return jsonify({"success": False, "message": "Unauthorized"}), 401

    try:
        data = request.get_json()
        visitor_id = data.get('visitorId')
        out_time = data.get('outTime')

        if not visitor_id or not out_time:
            return jsonify({"success": False, "message": "Missing required fields"}), 400

        today = datetime.now().date()
        try:
            out_time_dt = datetime.strptime(f"{today} {out_time}", '%Y-%m-%d %I:%M %p')
        except ValueError:
            return jsonify({"success": False, "message": "Invalid time format"}), 400

        with closing(get_connection()) as conn:
            with conn.cursor() as cursor:
                cursor.execute("""
                    UPDATE VisitorManagement
                    SET OutTime = ?
                    WHERE VisitorID = ?
                """, (out_time_dt, visitor_id))
                conn.commit()

        return jsonify({"success": True, "message": "Out time updated successfully"})

    except Exception as e:
        logger.error(f"Error updating out time: {str(e)}", exc_info=True)
        return jsonify({"success": False, "message": str(e)}), 500

@visitor_bp.route('/api/scan_barcode', methods=['POST'])
def handle_barcode_scan():
    if 'file' not in request.files:
        return jsonify({"success": False, "error": "No file uploaded"}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"success": False, "error": "No selected file"}), 400
    
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        os.makedirs(UPLOAD_FOLDER, exist_ok=True)
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        file.save(filepath)
        
        barcode_data = detect_qr_code(filepath)
        
        try:
            os.remove(filepath)
        except:
            pass
        
        if barcode_data:
            return jsonify({
                "success": True,
                "data": barcode_data,
                "type": "QRCODE"
            })
    
    return jsonify({"success": False, "error": "No barcode detected"}), 400

@visitor_bp.route('/api/get_visitor_reports', methods=['GET'])
def get_visitor_reports():
    if 'user_id' not in session:
        return jsonify({"success": False, "message": "Unauthorized"}), 401

    try:
        from_date = request.args.get('from')
        to_date = request.args.get('to')
        
        if not from_date or not to_date:
            return jsonify({"success": False, "message": "Both date ranges are required"}), 400

        with closing(get_connection()) as conn:
            with conn.cursor() as cursor:
                cursor.execute("""
                    SELECT 
                        VisitorID, Name, Phone, PersonToMeet, Purpose,
                        CONVERT(varchar, InTime, 120) as InTime,
                        CONVERT(varchar, OutTime, 120) as OutTime,
                        Photo
                    FROM VisitorManagement
                    WHERE CONVERT(date, CreatedOn) BETWEEN ? AND ?
                    ORDER BY CreatedOn DESC
                """, (from_date, to_date))
                
                visitors = []
                for row in cursor.fetchall():
                    visitor = {
                        "VisitorID": row[0],
                        "Name": row[1],
                        "Phone": row[2],
                        "PersonToMeet": row[3],
                        "Purpose": row[4],
                        "InTime": row[5],
                        "OutTime": row[6]
                    }
                    if row[7]:
                        visitor["PhotoBase64"] = base64.b64encode(row[7]).decode('utf-8')
                    visitors.append(visitor)

        return jsonify({
            "success": True,
            "visitors": visitors,
            "count": len(visitors)
        })

    except Exception as e:
        logger.error(f"Error generating report: {str(e)}", exc_info=True)
        return jsonify({"success": False, "message": str(e)}), 500
    
@visitor_bp.route('/api/get_usernames')
def get_usernames():
    if 'user_id' not in session:
        return jsonify({"success": False, "message": "Unauthorized"}), 401

    search_term = request.args.get('term', '').lower()
    try:
        with closing(get_connection()) as conn:
            with conn.cursor() as cursor:
                cursor.execute("""
                    SELECT DISTINCT Username 
                    FROM tblGlobalUserMaster
                    WHERE LOWER(Username) LIKE LOWER(?)
                    ORDER BY Username
                """, (f"%{search_term}%",))
                usernames = [row[0] for row in cursor.fetchall()]
                return jsonify(usernames)
    except Exception as e:
        logger.error(f"Error fetching usernames: {str(e)}", exc_info=True)
        return jsonify([])
    
@visitor_bp.route('/api/get_visitor_by_phone', methods=['GET'])
def get_visitor_by_phone():
    phone = request.args.get('phone')
    if not phone:
        return jsonify({"success": False, "message": "Phone number required"}), 400

    with closing(get_connection()) as conn:
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT Name, Address, PersonToMeet, Purpose
                FROM VisitorManagement
                WHERE Phone = ?
                ORDER BY CreatedOn DESC
            """, (phone,))
            row = cursor.fetchone()
            if row:
                return jsonify({
                    "success": True,
                    "name": row[0],
                    "address": row[1],
                    "personToMeet": row[2],
                    "purpose": row[3]
                })
            else:
                return jsonify({"success": False, "message": "No visitor found"}), 404
    
@visitor_bp.route('/logout')
def logout():
    session.pop('user_id', None)
    return redirect(url_for('visitor.visitor_login'))