from contextlib import closing
from datetime import datetime, timedelta
import logging
from datetime import datetime, time, timedelta
from flask import Blueprint, make_response, render_template, request, redirect, url_for, flash, session, jsonify
from database import get_connection
from flask import Blueprint

request_bp = Blueprint('request_bp', __name__)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

request_bp = Blueprint('request', __name__, template_folder='templates', url_prefix='/request')

@request_bp.route('/login', methods=['GET', 'POST'])
def request_login():
    if request.method == 'POST':
        user_id = request.form.get('userId', '').strip()
        password = request.form.get('password', '').strip()

        logger.info(f"Login attempt for User ID: {user_id}")

        if not user_id or not password:
            flash("User ID and Password are required.", "danger")
            return redirect(url_for('request.request_login'))

        try:
            with closing(get_connection()) as conn:
                if conn is None:
                    flash("Database connection failed. Please try again later.", "danger")
                    return redirect(url_for('request.request_login'))

                with conn.cursor() as cursor:
                    cursor.execute("""
                        SELECT UserID
                        FROM tblGlobalUserMaster
                        WHERE LOWER(UserID) = LOWER(?) AND Password = ?
                    """, (user_id, password))
                    user = cursor.fetchone()

                    if not user:
                        flash("Invalid User ID or Password.", "danger")
                        return redirect(url_for('request.request_login'))

                    session['user_id'] = user_id
                    logger.info(f"Successful login for User ID: {user_id}")
                    return redirect(url_for('request.home'))

        except Exception as e:
            logger.error(f"Error during login: {str(e)}", exc_info=True)
            flash("An error occurred while verifying credentials.", "danger")
            return redirect(url_for('request.request_login'))

    # For GET requests, render the login page
    return render_template('request/login.html') 

@request_bp.route('/home')
def home():
    if 'user_id' not in session:
        flash("Please log in to access this page.", "warning")
        return redirect(url_for('request_bp.request_login'))
    
    try:
        with closing(get_connection()) as conn:
            with conn.cursor() as cursor:
                # Get counts for the current user
                user_id = session['user_id']
                current_datetime = datetime.now()
                today_date = current_datetime.date()  # Get just the date part
                today_str = today_date.strftime('%Y-%m-%d')
                
                # Approved count (all time)
                cursor.execute("""
                    SELECT COUNT(*) 
                    FROM VisitorRequestManagement 
                    WHERE CreatedBy = ? AND RequestStatus = 'Approved'
                """, (user_id,))
                approved_count = cursor.fetchone()[0]
                
                # Pending count (all time)
                cursor.execute("""
                    SELECT COUNT(*) 
                    FROM VisitorRequestManagement 
                    WHERE CreatedBy = ? AND RequestStatus = 'Pending'
                """, (user_id,))
                pending_count = cursor.fetchone()[0]
                
                # Rejected count (all time)
                cursor.execute("""
                    SELECT COUNT(*) 
                    FROM VisitorRequestManagement 
                    WHERE CreatedBy = ? AND RequestStatus = 'Rejected'
                """, (user_id,))
                rejected_count = cursor.fetchone()[0]
                
                # Today's count - only events happening today
                cursor.execute("""
                    SELECT COUNT(*) 
                    FROM VisitorRequestManagement 
                    WHERE CreatedBy = ? 
                    AND CAST(EventDate AS DATE) = ?
                    AND StartTime >= ?
                """, (user_id, today_str, current_datetime.time()))
                today_count = cursor.fetchone()[0]

                # Get upcoming bookings (today's future events and future dates)
                cursor.execute("""
                    SELECT TOP 5
                        RequestID,
                        HallName,
                        MeetingWith,
                        EventDate,
                        StartTime,
                        EndTime,
                        RequestStatus
                    FROM VisitorRequestManagement
                    WHERE CreatedBy = ?
                    AND (
                        (EventDate > CAST(? AS DATE)) OR
                        (EventDate = CAST(? AS DATE) AND StartTime > ?)
                    )
                    ORDER BY EventDate, StartTime
                """, (user_id, today_date, today_date, current_datetime.time()))
                
                upcoming_bookings = []
                for row in cursor.fetchall():
                    # Format the date for display
                    event_date = row.EventDate
                    if not isinstance(event_date, datetime):
                        try:
                            event_date = datetime.strptime(str(event_date), '%Y-%m-%d')
                        except ValueError:
                            event_date = datetime.now()
                    
                    # Format the time for display
                    start_time = row.StartTime
                    if not hasattr(start_time, 'hour'):  # Check if it's not already a time object
                        try:
                            if isinstance(start_time, str):
                                start_time = datetime.strptime(start_time, '%H:%M:%S').time()
                            else:
                                start_time = datetime.strptime(str(start_time), '%H:%M:%S').time()
                        except ValueError:
                            start_time = datetime.now().time()
                    
                    # Determine date display format
                    if event_date.date() == today_date:
                        date_display = "Today"
                    elif event_date.date() == (today_date + timedelta(days=1)):
                        date_display = "Tomorrow"
                    else:
                        date_display = event_date.strftime('%a, %b %d')
                    
                    upcoming_bookings.append({
                        'hall_name': row.HallName,
                        'meeting_with': row.MeetingWith,
                        'date_display': date_display,
                        'time_display': start_time.strftime('%I:%M %p'),
                        'status': row.RequestStatus
                    })

                # Get recent activities
                cursor.execute("""
                    SELECT TOP 3
                        RequestID,
                        HallName,
                        MeetingWith,
                        RequestStatus,
                        RequestDateTime,
                        ResponseDateTime
                    FROM VisitorRequestManagement
                    WHERE CreatedBy = ?
                    ORDER BY RequestDateTime DESC
                """, (user_id,))
                
                recent_activities = []
                for row in cursor.fetchall():
                    # Format the request date
                    request_date = row.RequestDateTime
                    if not isinstance(request_date, datetime):
                        request_date = datetime.strptime(str(request_date), '%Y-%m-%d %H:%M:%S')
                    
                    # Determine activity type and message
                    if row.RequestStatus == 'Approved':
                        activity_type = 'approved'
                        icon = 'fa-check'
                        color = 'primary'
                        message = f'Your booking in {row.HallName} with {row.MeetingWith} has been approved'
                    elif row.RequestStatus == 'Pending':
                        activity_type = 'requested'
                        icon = 'fa-exclamation'
                        color = 'warning'
                        message = f'You requested {row.HallName} for meeting with {row.MeetingWith}'
                    else:  # Rejected or other status
                        activity_type = 'updated'
                        icon = 'fa-calendar-plus'
                        color = 'success'
                        message = f'Your booking in {row.HallName} was {row.RequestStatus.lower()}'
                    
                    # Format the time display
                    time_display = request_date.strftime('%b %d, %I:%M %p')
                    
                    recent_activities.append({
                        'type': activity_type,
                        'icon': icon,
                        'color': color,
                        'message': message,
                        'time': time_display
                    })

        return render_template('request/home.html', 
                             datetime=datetime,
                             approved_count=approved_count,
                             pending_count=pending_count,
                             rejected_count=rejected_count,
                             today_count=today_count,
                             upcoming_bookings=upcoming_bookings,
                             recent_activities=recent_activities)

    except Exception as e:
        logger.error(f"Error fetching dashboard data: {str(e)}", exc_info=True)
        flash("An error occurred while loading dashboard data.", "danger")
        return render_template('request/home.html', datetime=datetime)

@request_bp.route('/submit_booking', methods=['POST'])
def submit_booking():
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'User not logged in'}), 401

    try:
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['requesterName', 'department', 'requesterEmail', 'requesterPhone', 
                         'hallName', 'meetingWith', 'eventDate', 'startTime', 'endTime',
                         'expectedAttendees', 'purpose']
        
        for field in required_fields:
            if not data.get(field):
                return jsonify({'success': False, 'message': f'Missing required field: {field}'}), 400

        # Combine date and time fields into datetime objects
        start_datetime = datetime.strptime(f"{data['eventDate']} {data['startTime']}", "%Y-%m-%d %H:%M")
        end_datetime = datetime.strptime(f"{data['eventDate']} {data['endTime']}", "%Y-%m-%d %H:%M")

        # Check if end time is after start time
        if end_datetime <= start_datetime:
            return jsonify({'success': False, 'message': 'End time must be after start time'}), 400

        with closing(get_connection()) as conn:
            with conn.cursor() as cursor:
                # Insert the booking request
                cursor.execute("""
                    INSERT INTO VisitorRequestManagement (
                        RequesterName, RequesterEmail, RequesterPhone, Department,
                        HallName, MeetingWith, EventDate, StartTime, EndTime, ExpectedAttendees,
                        Purpose, RequestStatus, RequestDateTime, CreatedBy, CreatedOn
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    data['requesterName'],
                    data['requesterEmail'],
                    data['requesterPhone'],
                    data['department'],
                    data['hallName'],
                    data['meetingWith'],
                    data['eventDate'],
                    data['startTime'],
                    data['endTime'],
                    int(data['expectedAttendees']),
                    data['purpose'],
                    'Pending',  # Default status
                    datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                    session['user_id'],
                    datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                ))
                
                # Get the newly created RequestID
                request_id = cursor.execute("SELECT SCOPE_IDENTITY()").fetchone()[0]
                conn.commit()

                logger.info(f"New booking request submitted by {session['user_id']} with RequestID: {request_id}")
                
                return jsonify({
                    'success': True,
                    'request_id': request_id,
                    'message': 'Booking request submitted successfully'
                })

    except Exception as e:
        logger.error(f"Error submitting booking request: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'message': 'An error occurred while submitting the booking'}), 500
    
@request_bp.route('/logout')
def logout():
    user_id = session.get('user_id', 'Unknown')
    session.clear()
    logger.info(f"User {user_id} logged out")
    flash("You have been successfully logged out.", "success")
    return redirect(url_for('request.request_login'))
