from io import BytesIO
import xlsxwriter
import time
from datetime import datetime, timedelta
import socket
import base64
import ssl
from flask import Blueprint, Response, make_response, render_template, request, redirect, send_file, url_for, flash, session, jsonify
from database import get_connection
from datetime import datetime, time
import logging
from contextlib import closing
import os
from werkzeug.utils import secure_filename
# import cv2
import numpy as np
import smtplib
from email.message import EmailMessage
# from twilio.rest import Client 

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
                        SELECT UserID, EmployeeCode
                        FROM tblGlobalUserMaster
                        WHERE LOWER(UserID) = LOWER(?) AND Password = ?
                    """, (user_id, password))
                    user = cursor.fetchone()

                    if not user:
                        flash("Invalid User ID or Password.", "danger")
                        return redirect(url_for('visitor.visitor_login'))
                    
                    employee_code = user[1]

                    if employee_code == '171R0297':
                        session['user_id'] = user_id
                        return redirect(url_for('visitor.dashboard'))
                    
                    elif employee_code == '01140752':
                        session['user_id'] = user_id
                        return render_template('visitor/reception.html')

                    else:
                        flash("Access restricted. Only specific employees can login here.", "danger")
                        return redirect(url_for('visitor.visitor_login'))

        except Exception as e:
            logger.error(f"Error during login: {str(e)}", exc_info=True)
            flash("An error occurred while verifying credentials.", "danger")
            return redirect(url_for('visitor.visitor_login'))
        
    return render_template('visitor/login.html')


@visitor_bp.route('/dashboard')
def dashboard():
    if 'user_id' not in session:
        return redirect(url_for('visitor.visitor_login'))

    try:
        with closing(get_connection()) as conn:
            with conn.cursor() as cursor:
                # Total visitors
                cursor.execute("SELECT COUNT(*) FROM tblVisitorManagement")
                total_visitors = cursor.fetchone()[0]

                # Last month visitors
                last_month = datetime.now() - timedelta(days=30)
                cursor.execute("SELECT COUNT(*) FROM tblVisitorManagement WHERE CreatedOn >= ?", last_month)
                last_month_count = cursor.fetchone()[0]
                visitor_growth = round(((total_visitors - last_month_count) / last_month_count) * 100, 1) if last_month_count > 0 else 0

                # Today visitors
                today = datetime.now().date()
                cursor.execute("SELECT COUNT(*) FROM tblVisitorManagement WHERE CAST(CreatedOn AS DATE) = ?", today)
                today_visitors = cursor.fetchone()[0]

                # Yesterday visitors
                yesterday = today - timedelta(days=1)
                cursor.execute("SELECT COUNT(*) FROM tblVisitorManagement WHERE CAST(CreatedOn AS DATE) = ?", yesterday)
                yesterday_count = cursor.fetchone()[0]
                daily_growth = round(((today_visitors - yesterday_count) / yesterday_count) * 100, 1) if yesterday_count > 0 else 0

                # Upcoming appointments
                # Upcoming appointments (only pending)
                cursor.execute(""" SELECT COUNT(*) FROM tblVisitorRequestManagement WHERE EventDate >= ? AND RequestStatus = 'Pending' """, today)
                upcoming_appointments = cursor.fetchone()[0]


                # Last week's appointments
                last_week = today - timedelta(days=7)
                cursor.execute("""
                    SELECT COUNT(*) FROM tblVisitorRequestManagement
                    WHERE EventDate BETWEEN ? AND ?
                """, (last_week, today - timedelta(days=1)))
                last_week_count = cursor.fetchone()[0]
                appointment_change = round(((upcoming_appointments - last_week_count) / last_week_count) * 100, 1) if last_week_count > 0 else 0

        return render_template(
            'visitor/dashboard.html',
            username=session['user_id'],
            total_visitors=total_visitors,
            visitor_growth=visitor_growth,
            today_visitors=today_visitors,
            daily_growth=daily_growth,
            upcoming_appointments=upcoming_appointments,
            appointment_change=appointment_change
        )

    except Exception as e:
        logger.error(f"Error loading dashboard: {e}", exc_info=True)
        flash("Failed to load dashboard data.", "danger")
        return render_template('visitor/dashboard.html')

@visitor_bp.route('/visitor')
def visitor_page():
    if 'user_id' not in session:
        return redirect(url_for('visitor.visitor_login'))
    return render_template('visitor/visitor.html', username=session['user_id'])

@visitor_bp.route('/report')
def report_page():
    if 'user_id' not in session:
        return redirect(url_for('visitor.visitor_login'))
    return render_template('visitor/report.html', username=session['user_id'])

@visitor_bp.route('/api/save_visitor', methods=['POST'])
def save_visitor():
    if 'user_id' not in session:
        return jsonify({"success": False, "message": "Unauthorized"}), 401

    try:
        # Get form data
        phone = request.form.get('phone', '').strip()
        name = request.form.get('name', '').strip()
        type_of_visitor = request.form.get('visitorType', '').strip()
        no_of_persons = request.form.get('numberOfPersons', '1').strip()
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

        # Handle photo upload (keep file object)
        uploaded_file = None
        if 'photo' in request.files:
            file = request.files['photo']
            if file and file.filename != '':
                uploaded_file = file

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

        if id_card_no:
            with closing(get_connection()) as conn:
                with conn.cursor() as cursor:
                    cursor.execute("""
                        SELECT VisitorID FROM tblVisitorManagement 
                        WHERE IDCardNo = ? AND OutTime IS NULL
                    """, (id_card_no,))
                    if cursor.fetchone():
                        return jsonify({
                            "success": False,
                            "message": "This ID card is already in use by another visitor"
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
                    # Step 1: Insert without photo path
                    cursor.execute("""
                        INSERT INTO tblVisitorManagement (
                            Phone, Name, TypeOfVisitor, NoOfPersons, IDCardNo, Address, TabSerial, LaptopSerial, 
                            Pendrive, PersonToMeet, Purpose, InTime, OutTime, Remarks, Photo
                        ) OUTPUT INSERTED.VisitorID
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        phone, name, type_of_visitor, no_of_persons, id_card_no, address, tab_serial, laptop_serial,
                        pendrive, person_to_meet, purpose, in_time_dt, out_time_dt,
                        remarks, "pending"   # <-- placeholder
                    ))


                    # Step 2: Get new VisitorID
                    visitor_id = cursor.fetchone()[0]

                    photo_path = None
                    if uploaded_file:
                        # Step 3: Create directory
                        # base_dir = r"D:\Python\Visitor Photos"
                        base_dir = r"J:\Visitor Photos"
                        visitor_dir = os.path.join(base_dir, str(visitor_id))
                        os.makedirs(visitor_dir, exist_ok=True)

                        # Step 4: Save file
                        photo_filename = "visitor_photo.jpg"
                        photo_path = os.path.join(visitor_dir, photo_filename)
                        uploaded_file.save(photo_path)

                        # Step 5: Update record with photo path
                        cursor.execute("""
                            UPDATE tblVisitorManagement 
                            SET Photo = ?
                            WHERE VisitorID = ?
                        """, (photo_path, visitor_id))

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
                smtp_config = {
                    'server': "smtp.gmail.com",
                    'port': 587,
                    'username': "salzer2mis2019@gmail.com",
                    'password': "gzljkoroeotcxfov",
                    'timeout': 30
                }

                msg = EmailMessage()
                msg['From'] = smtp_config['username']
                msg['To'] = recipient_email
                msg['Subject'] = f"Visitor Notification: {name}"

                email_content = f"""
                <html>
                    <head>
                        <style>
                            body {{
                                font-family: Arial, sans-serif;
                                background-color: #f9f9f9;
                                color: #333333;
                                padding: 20px;
                            }}
                            .container {{
                                background-color: #ffffff;
                                padding: 20px;
                                border-radius: 8px;
                                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                                max-width: 600px;
                                margin: auto;
                            }}
                            h2 {{
                                color: #2c3e50;
                                border-bottom: 2px solid #e1e1e1;
                                padding-bottom: 10px;
                            }}
                            p {{
                                line-height: 1.6;
                            }}
                            .note {{
                                margin-top: 30px;
                                font-size: 12px;
                                color: #888888;
                                text-align: center;
                            }}
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <h2>Visitor Registered</h2>
                            <p><strong>Visitor Name:</strong> {name}</p>
                            <p><strong>Phone:</strong> {phone}</p>
                            <p><strong>From:</strong> {address}</p>
                            <p><strong>Meeting:</strong> {person_to_meet}</p>
                            <p><strong>Purpose:</strong> {purpose}</p>
                            <p><strong>Time:</strong> {in_time}</p>
                            <p><strong>ID Card:</strong> {id_card_no if id_card_no else 'Not provided'}</p>
                            <div class="note">
                                <p>This is an auto-generated email.Please do not reply to this mail</p>
                            </div>
                        </div>
                    </body>
                </html>
                """
                msg.set_content(email_content, subtype='html')

                # Attach photo if available
                if photo_path and os.path.exists(photo_path):
                    with open(photo_path, "rb") as f:
                        msg.add_attachment(
                            f.read(),
                            maintype='image',
                            subtype='jpeg',
                            filename='visitor_photo.jpg'
                        )

                # Attempt send
                max_attempts = 3
                for attempt in range(1, max_attempts + 1):
                    try:
                        context = ssl.create_default_context()
                        with smtplib.SMTP(smtp_config['server'], smtp_config['port'], timeout=smtp_config['timeout']) as server:
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
                            time.sleep(2)
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

@visitor_bp.route('/api/get_visitors')
def get_visitors():
    if 'user_id' not in session:
        return jsonify({"success": False, "message": "Unauthorized"}), 401

    try:
        with closing(get_connection()) as conn:
            with conn.cursor() as cursor:
                cursor.execute("""
                        SELECT 
                            VisitorID, Name, Phone, TypeOfVisitor, NoOfPersons, 
                            PersonToMeet, Purpose, IDCardNo,
                            CONVERT(varchar, InTime, 120) as InTime,
                            CONVERT(varchar, OutTime, 120) as OutTime,
                            CAST(Photo AS VARCHAR(MAX)) as PhotoPath
                        FROM tblVisitorManagement
                        WHERE OutTime IS NULL
                        ORDER BY InTime DESC
                    """)


                visitors = []
                for row in cursor.fetchall():
                    visitor = {
                        "VisitorID": row[0],
                        "Name": row[1],
                        "Phone": row[2],
                        "TypeOfVisitor": row[3],
                        "NoOfPersons": row[4],
                        "PersonToMeet": row[5],
                        "Purpose": row[6],
                        "IDCardNo": row[7],
                        "InTime": row[8],
                        "OutTime": row[9]
                    }

                    photo_path = row[10]  # File path saved in DB
                    if photo_path and os.path.exists(photo_path):
                        with open(photo_path, "rb") as f:
                            visitor["PhotoBase64"] = base64.b64encode(f.read()).decode('utf-8')

                    visitors.append(visitor)

        return jsonify({
            "success": True,
            "visitors": visitors,
            "count": len(visitors)
        })

    except Exception as e:
        logger.error(f"Error fetching visitors: {str(e)}", exc_info=True)
        return jsonify({"success": False, "message": str(e)}), 500
    
@visitor_bp.route('/api/get_visitor_details')
def get_visitor_details():
    if 'user_id' not in session:
        return jsonify({"success": False, "message": "Unauthorized"}), 401

    visitor_id = request.args.get('id')
    if not visitor_id:
        return jsonify({"success": False, "message": "Visitor ID required"}), 400

    try:
        with closing(get_connection()) as conn:
            with conn.cursor() as cursor:
                cursor.execute("""
                    SELECT 
                        VisitorID, Name, Phone, TypeOfVisitor, IDCardNo,
                        NoOfPersons, PersonToMeet, Purpose,
                        CONVERT(varchar, InTime, 120) as InTime,
                        CONVERT(varchar, OutTime, 120) as OutTime
                    FROM tblVisitorManagement
                    WHERE VisitorID = ?
                """, (visitor_id,))
                
                row = cursor.fetchone()
                if row:
                    visitor = {
                        "VisitorID": row[0],
                        "Name": row[1],
                        "Phone": row[2],
                        "TypeOfVisitor": row[3],
                        "IDCardNo": row[4],
                        "NoOfPersons": row[5],
                        "PersonToMeet": row[6],
                        "Purpose": row[7],
                        "InTime": row[8],
                        "OutTime": row[9]
                    }
                    return jsonify({
                        "success": True,
                        "visitor": visitor
                    })
                return jsonify({"success": False, "message": "Visitor not found"}), 404
                
    except Exception as e:
        logger.error(f"Error fetching visitor details: {str(e)}", exc_info=True)
        return jsonify({"success": False, "message": str(e)}), 500
        
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
                    UPDATE tblVisitorManagement
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
                            VisitorID, Name, Phone, TypeOfVisitor, Address, NoOfPersons, 
                            PersonToMeet, Purpose,
                            CONVERT(varchar, InTime, 120) as InTime,
                            CONVERT(varchar, OutTime, 120) as OutTime,
                            CAST(Photo AS VARCHAR(MAX)) as PhotoPath
                        FROM tblVisitorManagement
                        WHERE CONVERT(date, CreatedOn) BETWEEN ? AND ?
                        ORDER BY CreatedOn DESC
                    """, (from_date, to_date))
                
                visitors = []
                for row in cursor.fetchall():
                    visitor = {
                        "VisitorID": row[0],
                        "Name": row[1],
                        "Phone": row[2],
                        "TypeOfVisitor": row[3],
                        "Address": row[4],
                        "NoOfPersons": row[5],
                        "PersonToMeet": row[6],
                        "Purpose": row[7],
                        "InTime": row[8],
                        "OutTime": row[9]
                    }

                    photo_path = row[10]
                    if photo_path and os.path.exists(photo_path):
                        with open(photo_path, "rb") as f:
                            visitor["PhotoBase64"] = base64.b64encode(f.read()).decode('utf-8')

                    visitors.append(visitor)

        return jsonify({
            "success": True,
            "visitors": visitors,
            "count": len(visitors)
        })

    except Exception as e:
        logger.error(f"Error generating report: {str(e)}", exc_info=True)
        return jsonify({"success": False, "message": str(e)}), 500
    
@visitor_bp.route('/api/export_visitor_reports', methods=['GET'])
def export_visitor_reports():
    if 'user_id' not in session:
        return jsonify({"success": False, "message": "Unauthorized"}), 401

    try:
        from_date = request.args.get('from')
        to_date = request.args.get('to')
        visitor_type = request.args.get('type')
        
        if not from_date or not to_date:
            return jsonify({"success": False, "message": "Both date ranges are required"}), 400

        with closing(get_connection()) as conn:
            with conn.cursor() as cursor:
                # Build the query with optional type filter
                query = """
                    SELECT 
                        Name, Phone, TypeOfVisitor, Address, NoOfPersons, 
                        PersonToMeet, Purpose, InTime, OutTime
                    FROM tblVisitorManagement
                    WHERE CONVERT(date, CreatedOn) BETWEEN ? AND ?
                """
                params = [from_date, to_date]
                
                if visitor_type:
                    query += " AND TypeOfVisitor = ?"
                    params.append(visitor_type)
                
                query += " ORDER BY CreatedOn DESC"
                
                cursor.execute(query, params)
                
                # Create a new Excel workbook
                output = BytesIO()
                workbook = xlsxwriter.Workbook(output)
                worksheet = workbook.add_worksheet('Visitor Report')
                
                # Add header format
                header_format = workbook.add_format({
                    'bold': True,
                    'bg_color': "#36924A",
                    'font_color': 'white',
                    'border': 1,
                    'align': 'center',
                    'valign': 'vcenter'
                })
                
                # Add data format
                data_format = workbook.add_format({
                    'border': 1,
                    'align': 'left',
                    'valign': 'vcenter'
                })
                
                # Add date format
                date_format = workbook.add_format({
                    'border': 1,
                    'align': 'left',
                    'valign': 'vcenter',
                    'num_format': 'yyyy-mm-dd hh:mm:ss'
                })
                
                # Define column headers
                headers = [
                    'Name', 'Phone', 'Type', 'Address', 'No. of Persons',
                    'Person to Meet', 'Purpose', 'In Time', 'Out Time', 'Duration'
                ]
                
                # Write headers
                for col_num, header in enumerate(headers):
                    worksheet.write(0, col_num, header, header_format)
                    # Set column width
                    if header == 'Address':
                        worksheet.set_column(col_num, col_num, 30)  # Wider column for address
                    else:
                        worksheet.set_column(col_num, col_num, 15)
                
                # Write data rows
                for row_num, row in enumerate(cursor.fetchall(), 1):
                    name, phone, visitor_type, address, no_of_persons, person_to_meet, purpose, in_time, out_time = row
                    
                    # Calculate duration
                    duration = ''
                    if in_time and out_time:
                        try:
                            in_dt = datetime.strptime(str(in_time), '%Y-%m-%d %H:%M:%S')
                            out_dt = datetime.strptime(str(out_time), '%Y-%m-%d %H:%M:%S')
                            duration_seconds = (out_dt - in_dt).total_seconds()
                            hours = int(duration_seconds // 3600)
                            minutes = int((duration_seconds % 3600) // 60)
                            duration = f"{hours}h {minutes}m" if hours > 0 else f"{minutes}m"
                        except:
                            duration = 'N/A'
                    
                    # Write row data
                    worksheet.write(row_num, 0, name, data_format)
                    worksheet.write(row_num, 1, phone, data_format)
                    worksheet.write(row_num, 2, visitor_type, data_format)
                    worksheet.write(row_num, 3, address, data_format)
                    worksheet.write(row_num, 4, no_of_persons, data_format)
                    worksheet.write(row_num, 5, person_to_meet, data_format)
                    worksheet.write(row_num, 6, purpose, data_format)
                    worksheet.write(row_num, 7, in_time, date_format)
                    worksheet.write(row_num, 8, out_time, date_format)
                    worksheet.write(row_num, 9, duration, data_format)
                
                workbook.close()
                
                # Prepare response
                output.seek(0)
                response = Response(
                    output.read(),
                    mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={
                        "Content-Disposition": f"attachment; filename=visitor_report_{from_date}_to_{to_date}.xlsx"
                    }
                )
                
                return response

    except Exception as e:
        logger.error(f"Error exporting report: {str(e)}", exc_info=True)
        return jsonify({"success": False, "message": str(e)}), 500
    
@visitor_bp.route('/api/get_usernames')
def get_usernames():
    if 'user_id' not in session:
        return jsonify({"success": False, "message": "Unauthorized"}), 401

    search_term = request.args.get('term', '').strip()
    
    try:
        with closing(get_connection()) as conn:
            with conn.cursor() as cursor:
                # Search for active users with both conditions
                cursor.execute("""
                    SELECT DISTINCT Username 
                    FROM tblGlobalUserMaster
                    WHERE Username LIKE ? + '%'
                    AND DeActivatedDate IS NULL
                    AND Id_1 = 'Y'
                    ORDER BY Username ASC
                """, (search_term,))
                
                return jsonify([row[0] for row in cursor.fetchall()])
                
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
                FROM tblVisitorManagement
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
            
# @visitor_bp.route('/api/send_otp', methods=['POST'])
# def send_otp():
#     try:
#         phone_number = request.json.get('phone')
#         if not phone_number:
#             return jsonify({"success": False, "message": "Phone number is required"}), 400

#         # Initialize Twilio client (move these to config)
#         account_sid = 'ACbcb45be0e21a9b19a5a0eee62a5a14e9'  # Your Twilio Account SID
#         auth_token = 'e057d3fe136b92d8c119678e5d7cf9d5'  # Your Twilio Auth Token
#         verify_sid = 'VAfd2b570cf9e0fc7f86256c681a6af593'  # Your Verify Service SID
        
#         client = Client(account_sid, auth_token)

#         # Send OTP
#         verification = client.verify.v2.services(verify_sid) \
#             .verifications \
#             .create(to=phone_number, channel='sms')

#         return jsonify({
#             "success": True,
#             "message": "OTP sent successfully",
#             "verification_sid": verification.sid
#         })

#     except Exception as e:
#         logger.error(f"Error sending OTP: {str(e)}", exc_info=True)
#         return jsonify({
#             "success": False,
#             "message": "Failed to send OTP"
#         }), 500

# @visitor_bp.route('/api/verify_otp', methods=['POST'])
# def verify_otp():
#     try:
#         phone_number = request.json.get('phone')
#         otp_code = request.json.get('otp')
        
#         if not phone_number or not otp_code:
#             return jsonify({"success": False, "message": "Phone number and OTP are required"}), 400

#         # Initialize Twilio client
#         account_sid = 'ACbcb45be0e21a9b19a5a0eee62a5a14e9'
#         auth_token = 'e057d3fe136b92d8c119678e5d7cf9d5'
#         verify_sid = 'VAfd2b570cf9e0fc7f86256c681a6af593'
        
#         client = Client(account_sid, auth_token)

#         # Verify OTP
#         verification_check = client.verify.v2.services(verify_sid) \
#             .verification_checks \
#             .create(to=phone_number, code=otp_code)

#         if verification_check.status == 'approved':
#             return jsonify({
#                 "success": True,
#                 "message": "OTP verified successfully"
#             })
#         else:
#             return jsonify({
#                 "success": False,
#                 "message": "Invalid OTP"
#             }), 400

#     except Exception as e:
#         logger.error(f"Error verifying OTP: {str(e)}", exc_info=True)
#         return jsonify({
#             "success": False,
#             "message": "OTP verification failed"
#         }), 500
        
# Notificaton section 

@visitor_bp.route('/api/get_pending_requests', methods=['GET'])
def get_pending_requests():
    if 'user_id' not in session:
        return jsonify({"success": False, "message": "Unauthorized"}), 401

    try:
        today = datetime.now().date()
        with closing(get_connection()) as conn:
            with conn.cursor() as cursor:
                # Get count of pending requests for TODAY only
                cursor.execute("""
                    SELECT COUNT(*) 
                    FROM tblVisitorRequestManagement
                    WHERE CAST(EventDate AS DATE) = ?
                    AND RequestStatus = 'Pending'
                """, (today,))
                
                count = cursor.fetchone()[0]
                
                return jsonify({
                    "success": True,
                    "count": count
                })

    except Exception as e:
        logger.error(f"Error fetching pending requests count: {str(e)}")
        return jsonify({
            "success": False,
            "message": str(e)
        }), 500

@visitor_bp.route('/api/get_pending_requests_details', methods=['GET'])
def get_pending_requests_details():
    if 'user_id' not in session:
        return jsonify({"success": False, "message": "Unauthorized"}), 401

    try:
        today = datetime.now().date()
        with closing(get_connection()) as conn:
            with conn.cursor() as cursor:
                # Updated query with all the fields you requested
                cursor.execute("""
                    SELECT 
                        RequestID,
                        TypeOfMeeting,
                        RequesterName,
                        RequesterEmail,
                        RequesterPhone,
                        Department,
                        HallName,
                        MeetingWith AS VisitorName,
                        Purpose,
                        CONVERT(varchar, EventDate, 120) as EventDate,
                        CONVERT(varchar, StartTime, 120) as EventTime,
                        CONVERT(varchar, EndTime, 120) as EndTime,
                        ExpectedAttendees,
                        RequestStatus,
                        CreatedBy
                    FROM tblVisitorRequestManagement
                    WHERE CAST(EventDate AS DATE) = ?
                    AND RequestStatus = 'Pending'
                    ORDER BY EventDate ASC, StartTime ASC
                """, (today,))
                
                requests = []
                for row in cursor.fetchall():
                    requests.append({
                        "requestId": row[0],
                        "typeOfMeeting": row[1],
                        "requesterName": row[2],
                        "requesterEmail": row[3],
                        "requesterPhone": row[4],
                        "department": row[5],
                        "hallName": row[6],
                        "visitorName": row[7],  # MeetingWith
                        "purpose": row[8],
                        "eventDate": row[9],
                        "eventTime": row[10],
                        "endTime": row[11],
                        "expectedAttendees": row[12],
                        "status": row[13],
                        "createdBy": row[14]
                    })
                
                return jsonify({
                    "success": True,
                    "requests": requests,
                    "count": len(requests)
                })

    except Exception as e:
        logger.error(f"Error fetching request details: {str(e)}")
        return jsonify({
            "success": False,
            "message": str(e)
        }), 500
        
@visitor_bp.route('/api/check_id_card', methods=['GET'])
def check_id_card():
    if 'user_id' not in session:
        return jsonify({"success": False, "message": "Unauthorized"}), 401

    id_card_no = request.args.get('id_card_no', '').strip()
    if not id_card_no:
        return jsonify({"success": False, "message": "ID card number required"}), 400

    try:
        with closing(get_connection()) as conn:
            with conn.cursor() as cursor:
                cursor.execute("""
                    SELECT Name, CONVERT(varchar, InTime, 120) as InTime 
                    FROM tblVisitorManagement 
                    WHERE IDCardNo = ? AND OutTime IS NULL
                    ORDER BY InTime DESC
                """, (id_card_no,))
                result = cursor.fetchone()
                
                if result:
                    return jsonify({
                        "success": True,
                        "exists": True,
                        "name": result[0],
                        "in_time": result[1]  # Already formatted as string
                    })
                return jsonify({"success": True, "exists": False})
                
    except Exception as e:
        logger.error(f"Error checking ID card: {str(e)}", exc_info=True)
        return jsonify({"success": False, "message": str(e)}), 500    
        
@visitor_bp.route('/api/update_request_status', methods=['POST'])
def update_request_status():
    if 'user_id' not in session:
        return jsonify({"success": False, "message": "Unauthorized"}), 401

    try:
        data = request.get_json()
        request_id = data.get('requestId')
        status = data.get('status')
        response_notes = data.get('responseNotes', '')  # Get rejection reason or empty string

        if not request_id or not status:
            return jsonify({"success": False, "message": "Missing required fields"}), 400

        with closing(get_connection()) as conn:
            with conn.cursor() as cursor:
                cursor.execute("""
                    UPDATE tblVisitorRequestManagement
                    SET RequestStatus = ?, 
                        ResponseDateTime = GETDATE(),
                        ModifiedOn = GETDATE(),
                        ResponseNotes = ?
                    WHERE RequestID = ?
                """, (status, response_notes, request_id))
                conn.commit()

        return jsonify({
            "success": True,
            "message": "Request status updated successfully"
        })

    except Exception as e:
        logger.error(f"Error updating request status: {str(e)}")
        return jsonify({
            "success": False,
            "message": str(e)
        }), 500
        
### Reception ###

@visitor_bp.route('/api/get_today_visitors')
def get_today_visitors():
    try:
        today = datetime.now().date()
        
        with closing(get_connection()) as conn:
            with conn.cursor() as cursor:
                cursor.execute("""
                    SELECT VisitorID, Phone, Name, TypeOfVisitor, NoOfPersons, IDCardNo, 
                           Address, TabSerial, LaptopSerial, Pendrive, PersonToMeet, Purpose, 
                           InTime, OutTime, Remarks, Photo, CreatedOn
                    FROM tblVisitorManagement
                    WHERE CAST(InTime AS DATE) = ?
                    ORDER BY InTime DESC
                """, (today,))
                
                visitors = []
                for row in cursor.fetchall():
                    # Get the photo path from the database
                    photo_path = row.Photo
                    photo_data = None
                    
                    # If photo path exists and file exists, read and encode the image
                    if photo_path and os.path.exists(photo_path):
                        try:
                            with open(photo_path, "rb") as f:
                                photo_data = base64.b64encode(f.read()).decode('utf-8')
                        except Exception as photo_error:
                            logger.warning(f"Error reading photo for visitor {row.VisitorID}: {str(photo_error)}")
                            photo_data = None
                    
                    visitors.append({
                        'visitorId': row.VisitorID,
                        'phone': row.Phone,
                        'name': row.Name,
                        'typeOfVisitor': row.TypeOfVisitor,
                        'noOfPersons': row.NoOfPersons,
                        'idCardNo': row.IDCardNo,
                        'address': row.Address,
                        'tabSerial': row.TabSerial,
                        'laptopSerial': row.LaptopSerial,
                        'pendrive': row.Pendrive,
                        'personToMeet': row.PersonToMeet,
                        'purpose': row.Purpose,
                        'inTime': row.InTime.isoformat() if row.InTime else None,
                        'outTime': row.OutTime.isoformat() if row.OutTime else None,
                        'remarks': row.Remarks,
                        'photo': photo_data,  # Base64 encoded image data
                        'photoPath': photo_path,  # Also include the path for reference
                        'createdOn': row.CreatedOn.isoformat() if row.CreatedOn else None
                    })
                
                return jsonify({'success': True, 'visitors': visitors})
                
    except Exception as e:
        logger.error(f"Error fetching today's visitors: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'message': 'Failed to fetch visitors'}), 500
    
@visitor_bp.route('/api/get_visitor_photo/<int:visitor_id>')
def get_visitor_photo(visitor_id):
    if 'user_id' not in session:
        return jsonify({"success": False, "message": "Unauthorized"}), 401
    
    try:
        with closing(get_connection()) as conn:
            with conn.cursor() as cursor:
                cursor.execute("SELECT Photo FROM tblVisitorManagement WHERE VisitorID = ?", (visitor_id,))
                row = cursor.fetchone()
                
                if row and row.Photo and os.path.exists(row.Photo):
                    return send_file(row.Photo, mimetype='image/jpeg')
                else:
                    return jsonify({"success": False, "message": "Photo not found"}), 404
                    
    except Exception as e:
        logger.error(f"Error fetching visitor photo: {str(e)}", exc_info=True)
        return jsonify({"success": False, "message": str(e)}), 500
    
@visitor_bp.route('/logout')
def logout():
    session.pop('user_id', None)
    return redirect(url_for('visitor.visitor_login'))