document.addEventListener('DOMContentLoaded', function () {
    // Initialize AOS animation library
    AOS.init({
        duration: 600,
        easing: 'ease-out',
        once: true
    });

    // Mobile menu toggle
    const mobileMenuBtn = document.querySelector('.navbar-toggler');
    const navbarCollapse = document.querySelector('.navbar-collapse');

    mobileMenuBtn.addEventListener('click', function () {
        navbarCollapse.classList.toggle('show');
    });

    // Dark mode toggle
    const darkModeToggle = document.querySelector('.dark-mode-toggle');

    darkModeToggle.addEventListener('click', function () {
        document.body.classList.toggle('dark-mode');
        darkModeToggle.classList.toggle('active');

        // Save preference to localStorage
        const isDarkMode = document.body.classList.contains('dark-mode');
        localStorage.setItem('darkMode', isDarkMode);
    });

    // Check for saved dark mode preference
    if (localStorage.getItem('darkMode') === 'true') {
        document.body.classList.add('dark-mode');
        darkModeToggle.classList.add('active');
    }

    // FAB click handler
    const fab = document.querySelector('.fab');
    fab.addEventListener('click', function () {
        const modal = new bootstrap.Modal(document.getElementById('bookingModal'));
        modal.show();
    });


    // Set minimum time for time inputs based on current time if date is today
    const today = new Date().toISOString().split('T')[0];
    const eventDateInput = document.getElementById('eventDate');
    const startTimeInput = document.getElementById('startTime');
    const endTimeInput = document.getElementById('endTime');

    function setMinTime() {
        if (eventDateInput.value === today) {
            const now = new Date();
            // Add 30 minutes to current time as minimum start time
            const minTime = new Date(now.getTime() + 30 * 60000);
            const hours = minTime.getHours().toString().padStart(2, '0');
            const minutes = minTime.getMinutes().toString().padStart(2, '0');
            startTimeInput.min = `${hours}:${minutes}`;
        } else {
            startTimeInput.removeAttribute('min');
        }
    }

    eventDateInput.addEventListener('change', setMinTime);
    setMinTime(); // Initialize
});

// Update the form submission handler
hallBookingForm.addEventListener('submit', function (e) {
    e.preventDefault();

    // Collect form data
    const formData = {
        requesterName: document.getElementById('requesterName').value,
        department: document.getElementById('department').value,
        requesterEmail: document.getElementById('requesterEmail').value,
        requesterPhone: document.getElementById('requesterPhone').value,
        hallName: document.getElementById('hallName').value,
        meetingWith: document.getElementById('meetingWith').value,
        eventDate: document.getElementById('eventDate').value,
        startTime: document.getElementById('startTime').value,
        endTime: document.getElementById('endTime').value,
        expectedAttendees: document.getElementById('expectedAttendees').value,
        purpose: document.getElementById('purpose').value
    };

    // Validate required fields
    if (!formData.meetingWith) {
        alert('Please enter who you are meeting with');
        return;
    }

    // Send data to server
    fetch('/request/submit_booking', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData)
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Show success modal
                document.getElementById('modalRequestId').textContent = data.request_id;
                const successModal = new bootstrap.Modal(document.getElementById('successModal'));
                successModal.show();

                // Hide booking modal
                const bookingModal = bootstrap.Modal.getInstance(document.getElementById('bookingModal'));
                bookingModal.hide();

                // Reset form
                hallBookingForm.reset();
            } else {
                alert('Error submitting booking: ' + data.message);
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('An error occurred while submitting the booking');
        });
});

// Reset form when modal is closed
document.getElementById('bookingModal').addEventListener('hidden.bs.modal', function () {
    document.getElementById('hallBookingForm').reset();
});
