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
                        SELECT UserID, UserName
                        FROM tblGlobalUserMaster
                        WHERE LOWER(UserID) = LOWER(?) AND Password = ?
                    """, (user_id, password))
                    user = cursor.fetchone()

                    if not user:
                        flash("Invalid User ID or Password.", "danger")
                        return redirect(url_for('request.request_login'))

                    session['user_id'] = user.UserID
                    session['user_name'] = user.UserName
                    session['show_calendar_reminder'] = True  # Add this flag
                    logger.info(f"Successful login for User ID: {user_id}")
                    return redirect(url_for('request.home'))

        except Exception as e:
            logger.error(f"Error during login: {str(e)}", exc_info=True)
            flash("An error occurred while verifying credentials.", "danger")
            return redirect(url_for('request.request_login'))

    return render_template('request/login.html')

@request_bp.route('/clear_calendar_reminder', methods=['POST'])
def clear_calendar_reminder():
    session.pop('show_calendar_reminder', None)
    return '', 204

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
                    FROM tblVisitorRequestManagement 
                    WHERE CreatedBy = ? AND RequestStatus = 'Approved'
                """, (user_id,))
                approved_count = cursor.fetchone()[0]
                
                # Pending count (all time)
                cursor.execute("""
                    SELECT COUNT(*) 
                    FROM tblVisitorRequestManagement 
                    WHERE CreatedBy = ? AND RequestStatus = 'Pending'
                """, (user_id,))
                pending_count = cursor.fetchone()[0]
                
                # Rejected count (all time)
                cursor.execute("""
                    SELECT COUNT(*) 
                    FROM tblVisitorRequestManagement 
                    WHERE CreatedBy = ? AND RequestStatus = 'Rejected'
                """, (user_id,))
                rejected_count = cursor.fetchone()[0]
                
                # Today's count - only events happening today
                cursor.execute("""
                    SELECT COUNT(*) 
                    FROM tblVisitorRequestManagement 
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
                    FROM tblVisitorRequestManagement
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
                    FROM tblVisitorRequestManagement
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

        # Determine meeting type (default to 'Internal' if not specified)
        is_internal = data.get('isInternal')
        meeting_type = 'Internal' if is_internal else 'External'
        # Set RequestStatus based on meeting type
        request_status = 'Approved' if is_internal else 'Pending'

        with closing(get_connection()) as conn:
            with conn.cursor() as cursor:
                # First check for existing bookings
                cursor.execute("""
                    SELECT COUNT(*) 
                    FROM tblVisitorRequestManagement
                    WHERE HallName = ?
                    AND EventDate = ?
                    AND (
                        (StartTime < ? AND EndTime > ?) OR
                        (StartTime < ? AND EndTime > ?) OR
                        (StartTime >= ? AND EndTime <= ?)
                    )
                    AND RequestStatus != 'Rejected'
                """, (
                    data['hallName'], data['eventDate'],
                    data['startTime'], data['startTime'],
                    data['endTime'], data['endTime'],
                    data['startTime'], data['endTime']
                ))
                
                existing_count = cursor.fetchone()[0]
                
                if existing_count > 0:
                    return jsonify({
                        'success': False,
                        'message': 'The hall is already booked during the requested time. Please choose a different time or hall.'
                    }), 400

                # Insert the booking request
                cursor.execute("""
                    INSERT INTO tblVisitorRequestManagement (
                        RequesterName, RequesterEmail, RequesterPhone, Department,
                        HallName, MeetingWith, EventDate, StartTime, EndTime, ExpectedAttendees,
                        Purpose, RequestStatus, RequestDateTime, CreatedBy, CreatedOn, TypeOfMeeting
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                    request_status,
                    datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                    session['user_id'],
                    datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                    meeting_type  # Add the meeting type
                ))
                
                # Get the actual database ID (primary key)
                cursor.execute("SELECT IDENT_CURRENT('tblVisitorRequestManagement')")
                request_id = cursor.fetchone()[0]
                conn.commit()

                logger.info(f"New booking request submitted by {session['user_id']} with ID: {request_id}, Type: {meeting_type}")
                
                return jsonify({
                    'success': True,
                    'request_id': request_id,  # This is the actual database ID
                    'message': 'Booking request submitted successfully'
                })

    except Exception as e:
        logger.error(f"Error submitting booking request: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'message': 'An error occurred while submitting the booking'}), 500
    
@request_bp.route('/api/bookings')
def get_bookings():
    current_date = datetime.now().strftime('%Y-%m-%d')
    current_user_id = session.get('user_id')  # Get current user ID from session
    
    try:
        with closing(get_connection()) as conn:
            with conn.cursor() as cursor:
                # Get ALL approved bookings (for main calendar) - EXCLUDE CANCELLED
                cursor.execute("""
                    SELECT 
                        RequesterName,
                        HallName,
                        CONVERT(varchar, EventDate, 23) AS EventDate,
                        CONVERT(varchar, StartTime, 108) AS StartTime,
                        CONVERT(varchar, EndTime, 108) AS EndTime,
                        CreatedBy,
                        RequestStatus  -- Add status to the query
                    FROM tblVisitorRequestManagement
                    WHERE EventDate >= ? AND RequestStatus != 'Cancelled'  -- Exclude cancelled bookings
                    ORDER BY EventDate, StartTime
                """, (current_date,))
                
                columns = [column[0] for column in cursor.description]
                all_bookings = []
                user_bookings = []
                
                for row in cursor.fetchall():
                    booking = dict(zip(columns, row))
                    # Format time to HH:MM
                    booking['StartTime'] = booking['StartTime'][:5] if booking['StartTime'] else ''
                    booking['EndTime'] = booking['EndTime'][:5] if booking['EndTime'] else ''
                    
                    # Check if this is current user's booking
                    is_current_user = str(booking['CreatedBy']) == str(current_user_id)
                    booking['isCurrentUser'] = is_current_user
                    
                    all_bookings.append(booking)
                    if is_current_user:
                        user_bookings.append(booking)
                
                return jsonify({
                    'all': all_bookings,
                    'user': user_bookings
                })
    except Exception as e:
        print(f"Error fetching bookings: {str(e)}")
        return jsonify({"error": str(e)}), 500

@request_bp.route('/api/pending-requests', methods=['GET'])
def get_pending_requests():
    if 'user_id' not in session:
        return jsonify({'error': 'User not logged in'}), 401

    try:
        with closing(get_connection()) as conn:
            with conn.cursor() as cursor:
                # Fetch pending requests for the current user
                cursor.execute("""
                    SELECT RequestID, RequesterName, HallName, MeetingWith, 
                           EventDate, StartTime, EndTime, Purpose
                    FROM tblVisitorRequestManagement
                    WHERE CreatedBy = ? AND RequestStatus = 'Pending'
                    ORDER BY EventDate, StartTime
                """, (session['user_id'],))
                
                requests = []
                for row in cursor.fetchall():
                    requests.append({
                        'RequestID': row.RequestID,
                        'RequesterName': row.RequesterName,
                        'HallName': row.HallName,
                        'MeetingWith': row.MeetingWith,
                        'EventDate': row.EventDate.strftime('%Y-%m-%d') if row.EventDate else '',
                        'StartTime': str(row.StartTime) if row.StartTime else '',
                        'EndTime': str(row.EndTime) if row.EndTime else '',
                        'Purpose': row.Purpose
                    })
                
                return jsonify({'requests': requests})
                
    except Exception as e:
        logger.error(f"Error fetching pending requests: {str(e)}", exc_info=True)
        return jsonify({'error': 'An error occurred while fetching pending requests'}), 500

@request_bp.route('/api/cancel-request/<int:request_id>', methods=['POST'])
def cancel_request(request_id):
    if 'user_id' not in session:
        return jsonify({'error': 'User not logged in'}), 401

    try:
        with closing(get_connection()) as conn:
            with conn.cursor() as cursor:
                # Check if the request belongs to the current user
                cursor.execute("""
                    SELECT CreatedBy FROM tblVisitorRequestManagement 
                    WHERE RequestID = ? AND RequestStatus = 'Pending'
                """, (request_id,))
                
                result = cursor.fetchone()
                if not result:
                    return jsonify({'error': 'Request not found or already processed'}), 404
                
                if result.CreatedBy != session['user_id']:
                    return jsonify({'error': 'Unauthorized to cancel this request'}), 403
                
                # Update the request status to Cancelled - ADD ModifiedBy FIELD
                cursor.execute("""
                    UPDATE tblVisitorRequestManagement 
                    SET RequestStatus = 'Cancelled', 
                        ModifiedOn = ?,
                        ModifiedBy = ?
                    WHERE RequestID = ?
                """, (datetime.now(), session['user_id'], request_id))
                
                conn.commit()
                
                logger.info(f"Request {request_id} cancelled by user {session['user_id']}")
                
                return jsonify({'success': True, 'message': 'Request cancelled successfully'})
                
    except Exception as e:
        logger.error(f"Error cancelling request {request_id}: {str(e)}", exc_info=True)
        return jsonify({'error': 'An error occurred while cancelling the request'}), 500
    
@request_bp.route('/logout')
def logout():
    session.clear()  # Clear all session data
    return redirect(url_for('request.request_login'))
