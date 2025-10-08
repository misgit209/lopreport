// Global variables
let html5QrCode = null;
let currentScannerType = 'web';
let currentInputField = null;

document.addEventListener('DOMContentLoaded', function () {
    // Toggle sidebar on desktop
    const sidebar = document.querySelector('.sidebar');
    const menuToggle = document.querySelector('.menu-toggle');
    const closeBtn = document.querySelector('.close-btn');
    const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');

    // Toggle sidebar when mobile menu button is clicked
    mobileMenuToggle.addEventListener('click', function () {
        sidebar.classList.toggle('active');
    });

    // Close sidebar when close button is clicked (mobile)
    closeBtn.addEventListener('click', function () {
        sidebar.classList.remove('active');
    });

    // Close sidebar when clicking outside (mobile)
    document.addEventListener('click', function (event) {
        const isClickInsideSidebar = sidebar.contains(event.target);
        const isClickOnMenuBtn = mobileMenuToggle.contains(event.target);

        if (!isClickInsideSidebar && !isClickOnMenuBtn && sidebar.classList.contains('active')) {
            sidebar.classList.remove('active');
        }
    });

    // Initialize date/time picker
    flatpickr("#inTime", {
        enableTime: true,
        noCalendar: true,
        dateFormat: "h:i K",
        defaultDate: "now"
    });

    // Tab switching functionality
    setupTabSwitching();

    // Show other purpose input when "Other" is selected
    document.getElementById('purpose').addEventListener('change', function () {
        const otherContainer = document.getElementById('otherPurposeContainer');
        if (this.value === 'other') {
            otherContainer.style.display = 'block';
            document.getElementById('otherPurpose').required = true;
        } else {
            otherContainer.style.display = 'none';
            document.getElementById('otherPurpose').required = false;
        }
    });

    // Photo upload preview
    document.getElementById('photoUpload').addEventListener('change', function (e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function (event) {
                document.getElementById('photoPreview').src = event.target.result;
            };
            reader.readAsDataURL(file);
        }
    });

    // Scanner type selection
    document.querySelectorAll('input[name="scannerType"]').forEach(radio => {
        radio.addEventListener('change', function () {
            currentScannerType = this.value;
            document.getElementById('web-scanner-container').style.display =
                this.value === 'web' ? 'block' : 'none';
            document.getElementById('mobile-scanner-container').style.display =
                this.value === 'mobile' ? 'block' : 'none';

            // Stop web scanner if switching away
            if (this.value !== 'web' && html5QrCode) {
                html5QrCode.stop().catch(() => { });
            }
        });
    });

    // Scan button handler
    document.querySelectorAll('.scan-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            currentInputField = this.closest('.input-with-scan').querySelector('input');
            const modal = new bootstrap.Modal(document.getElementById('barcodeModal'));
            modal.show();

            // Reset modal state
            document.getElementById('use-scan-result').style.display = 'none';
            document.getElementById('mobile-scan-result').style.display = 'none';

            // Set default scanner type based on device
            if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
                document.getElementById('mobileScanner').checked = true;
                currentScannerType = 'mobile';
                document.getElementById('web-scanner-container').style.display = 'none';
                document.getElementById('mobile-scanner-container').style.display = 'block';
            } else {
                document.getElementById('webScanner').checked = true;
                currentScannerType = 'web';
                document.getElementById('web-scanner-container').style.display = 'block';
                document.getElementById('mobile-scanner-container').style.display = 'none';
            }
        });
    });

    // Web Camera Scanner
    document.getElementById('barcodeModal').addEventListener('shown.bs.modal', function () {
        if (currentScannerType === 'web') {
            startWebScanner();
        }
    });

    // Mobile Scanner
    document.getElementById('open-mobile-camera').addEventListener('click', function () {
        document.getElementById('mobile-camera-input').click();
    });

    document.getElementById('mobile-camera-input').addEventListener('change', function (e) {
        const file = e.target.files[0];
        if (!file) return;

        const resultDiv = document.getElementById('mobile-scan-result');
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> Processing scan...';
        resultDiv.className = 'alert alert-warning';

        const formData = new FormData();
        formData.append('file', file);

        fetch('/visitor/api/scan_barcode', {
            method: 'POST',
            body: formData
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    resultDiv.innerHTML = `<strong>Scanned:</strong> ${data.data} (${data.type})`;
                    resultDiv.className = 'alert alert-success';
                    document.getElementById('use-scan-result').style.display = 'block';
                    document.getElementById('use-scan-result').dataset.scannedText = data.data;
                } else {
                    resultDiv.innerHTML = `<strong>Error:</strong> ${data.error || 'No barcode detected'}`;
                    resultDiv.className = 'alert alert-danger';
                }
            })
            .catch(error => {
                resultDiv.innerHTML = `<strong>Error:</strong> ${error.message}`;
                resultDiv.className = 'alert alert-danger';
            });
    });

    // Use scan result
    document.getElementById('use-scan-result').addEventListener('click', function () {
        if (currentInputField && this.dataset.scannedText) {
            currentInputField.value = this.dataset.scannedText;
            const modal = bootstrap.Modal.getInstance(document.getElementById('barcodeModal'));
            modal.hide();
        }
    });

    // Clean up when modal closes
    document.getElementById('barcodeModal').addEventListener('hidden.bs.modal', function () {
        if (html5QrCode) {
            html5QrCode.stop().catch(() => { });
        }
        document.getElementById('mobile-camera-input').value = '';
    });

    // Form submission
    document.getElementById('visitorForm').addEventListener('submit', function (e) {
        e.preventDefault();

        // Validate form
        const requiredFields = ['phone', 'name', 'personToMeet', 'purpose', 'inTime'];
        let isValid = true;

        requiredFields.forEach(field => {
            const element = document.getElementById(field);
            if (!element.value) {
                element.classList.add('is-invalid');
                isValid = false;
            } else {
                element.classList.remove('is-invalid');
            }
        });

        // If "Other" is selected, validate the otherPurpose field
        const purposeSelect = document.getElementById('purpose');
        if (purposeSelect.value === 'other') {
            const otherPurposeInput = document.getElementById('otherPurpose');
            if (!otherPurposeInput.value.trim()) {
                otherPurposeInput.classList.add('is-invalid');
                showAlert('Please specify the purpose.', 'danger');
                return;
            } else {
                otherPurposeInput.classList.remove('is-invalid');
            }
        }

        if (!isValid) {
            showAlert('Please fill in all required fields.', 'danger');
            return;
        }

        // Prepare form data
        const formData = new FormData(this);

        // If "Other" is selected, set the purpose field to the otherPurpose value
        if (purposeSelect.value === 'other') {
            formData.set('purpose', document.getElementById('otherPurpose').value.trim());
        }

        // Show loading state
        const submitBtn = this.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> Saving...';
        submitBtn.disabled = true;

        // Submit form
        fetch('/visitor/api/save_visitor', {
            method: 'POST',
            body: formData
        })
            .then(response => {
                if (!response.ok) {
                    return response.json().then(err => {
                        throw new Error(err.message || 'Network response was not ok');
                    });
                }
                return response.json();
            })
            .then(data => {
                if (data.success) {
                    showAlert(data.message, 'success');

                    // Reset form
                    this.reset();
                    document.getElementById('photoPreview').src = '/static/images/Profile.jpg';
                    document.getElementById('otherPurposeContainer').style.display = 'none';

                    // If on records page, refresh the data
                    if (!document.getElementById('recordsSection').classList.contains('d-none')) {
                        loadVisitorRecords();
                    }
                } else {
                    throw new Error(data.message || 'Failed to save visitor');
                }
            })
            .catch(error => {
                showAlert(error.message, 'danger');
            })
            .finally(() => {
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
            });
    });

    // Floating button scroll to form
    document.getElementById('addVisitorBtn').addEventListener('click', function () {
        document.getElementById('visitorTab').click();
        document.querySelector('#visitorForm').scrollIntoView({
            behavior: 'smooth'
        });
    });

    // Initialize autocomplete for personToMeet field
    $(function () {
        $("#personToMeet").autocomplete({
            source: function (request, response) {
                $.ajax({
                    url: "/visitor/api/get_usernames",
                    data: { term: request.term },
                    success: function (data) {
                        response(data);
                    },
                    error: function () {
                        response([]);
                    }
                });
            },
            minLength: 1,
            focus: function (event, ui) {
                // Prevent value insertion on focus
                event.preventDefault();
            },
            select: function (event, ui) {
                // Set the selected value
                $(this).val(ui.item.value);
                return false;
            }
        }).autocomplete("instance")._renderItem = function (ul, item) {
            // Custom rendering if needed
            return $("<li>")
                .append(`<div>${item.value}</div>`)
                .appendTo(ul);
        };
    });

    // Search functionality
    function searchVisitors() {
        const searchTerm = document.getElementById('searchInput').value.toLowerCase().trim();

        // If search is empty, load all records
        if (!searchTerm) {
            loadVisitorRecords();
            return;
        }

        fetch('/visitor/api/get_visitors')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                return response.json();
            })
            .then(data => {
                if (data.success) {
                    const filtered = data.visitors.filter(visitor => {
                        const nameMatch = visitor.Name && visitor.Name.toLowerCase().includes(searchTerm);
                        const phoneMatch = visitor.Phone && visitor.Phone.toLowerCase().includes(searchTerm);
                        const personMatch = visitor.PersonToMeet && visitor.PersonToMeet.toLowerCase().includes(searchTerm);
                        return nameMatch || phoneMatch || personMatch;
                    });

                    if (filtered.length === 0) {
                        showAlert('No matching records found', 'warning');
                    }
                    renderVisitorRecords(filtered);
                } else {
                    throw new Error(data.message || 'Failed to load data');
                }
            })
            .catch(error => {
                console.error('Error searching visitors:', error);
                showAlert('Error searching visitors: ' + error.message, 'danger');
            });
    }

    // Add search button click handler
    document.getElementById('searchBtn').addEventListener('click', searchVisitors);

    // Add search on Enter key
    document.getElementById('searchInput').addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            searchVisitors();
        }
    });

    document.getElementById('backBtn').addEventListener('click', function () {
        document.getElementById('visitorTab').click();
    });

    // Logout button
    document.querySelector('.logout').addEventListener('click', function () {
        if (confirm('Are you sure you want to logout?')) {
            window.location.href = '/visitor/logout';
        }
    });

    // ========== PHONE NUMBER AUTO-FILL FUNCTIONALITY ==========

    // Phone number blur event to fetch visitor details
    const phoneInput = document.getElementById('phone');
    if (phoneInput) {
        phoneInput.addEventListener('blur', function () {
            const phone = phoneInput.value.trim();

            // Only proceed if phone number is not empty and has at least 10 digits
            if (phone.length < 10) {
                clearVisitorFields();
                return;
            }

            console.log('Fetching visitor details for phone:', phone); // Debug log

            // Show loading state
            const otpStatus = document.getElementById('otpStatus');
            if (otpStatus) {
                otpStatus.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> Checking phone number...';
                otpStatus.className = 'mt-2 small text-info';
            }

            fetch(`/visitor/api/get_visitor_by_phone?phone=${encodeURIComponent(phone)}`)
                .then(response => {
                    console.log('API Response status:', response.status); // Debug log
                    if (!response.ok) {
                        throw new Error('Network response was not ok');
                    }
                    return response.json();
                })
                .then(data => {
                    console.log('API Response data:', data); // Debug log
                    if (data.success) {
                        // Populate the form fields with fetched data
                        if (data.name && document.getElementById('name')) {
                            document.getElementById('name').value = data.name;
                        }
                        if (data.visitorType && document.getElementById('visitorType')) {
                            document.getElementById('visitorType').value = data.visitorType;
                        }
                        if (data.address && document.getElementById('address')) {
                            document.getElementById('address').value = data.address;
                        }
                        if (data.personToMeet && document.getElementById('personToMeet')) {
                            document.getElementById('personToMeet').value = data.personToMeet;
                        }
                        if (data.purpose && document.getElementById('purpose')) {
                            document.getElementById('purpose').value = data.purpose;

                            // Handle "other" purpose specifically
                            if (data.purpose === 'other' && document.getElementById('otherPurposeContainer')) {
                                document.getElementById('otherPurposeContainer').style.display = 'block';
                            }
                        }

                        // Update status message
                        if (otpStatus) {
                            otpStatus.innerHTML = '<i class="fas fa-check-circle me-1"></i> Visitor details loaded successfully';
                            otpStatus.className = 'mt-2 small text-success';
                        }

                        showAlert('Visitor details loaded successfully', 'success');
                    }
                    else {
                        // No visitor found - clear the fields
                        clearVisitorFields();

                        if (otpStatus) {
                            otpStatus.innerHTML = '<i class="fas fa-info-circle me-1"></i> New visitor - please fill in details';
                            otpStatus.className = 'mt-2 small text-warning';
                        }
                    }
                })
                .catch(error => {
                    console.error('Error fetching visitor details:', error);
                    clearVisitorFields();

                    if (otpStatus) {
                        otpStatus.innerHTML = '<i class="fas fa-exclamation-triangle me-1"></i> Error checking phone number';
                        otpStatus.className = 'mt-2 small text-danger';
                    }

                    showAlert('Error checking phone number: ' + error.message, 'danger');
                });
        });

        // Clear fields when phone number is changed
        phoneInput.addEventListener('input', function () {
            const phone = phoneInput.value.trim();
            if (phone.length === 0) {
                clearVisitorFields();
                const otpStatus = document.getElementById('otpStatus');
                if (otpStatus) {
                    otpStatus.innerHTML = '';
                    otpStatus.className = 'mt-2 small';
                }
            }
        });
    }

    // Function to clear visitor detail fields
    function clearVisitorFields() {
        const fieldsToClear = ['name', 'address', 'personToMeet'];

        fieldsToClear.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.value = '';
            }
        });

        // Reset purpose dropdown but don't clear it completely
        const purposeSelect = document.getElementById('purpose');
        if (purposeSelect) {
            purposeSelect.value = '';
        }

        // Hide other purpose container if visible
        const otherPurposeContainer = document.getElementById('otherPurposeContainer');
        if (otherPurposeContainer) {
            otherPurposeContainer.style.display = 'none';
        }
    }
});

// Function to start web scanner
function startWebScanner() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showAlert("Camera not supported by your browser. Please use Chrome, Edge, or Firefox on a modern phone or tablet, and make sure you are using HTTPS.", "danger");
        return;
    }

    if (html5QrCode) {
        html5QrCode.stop().catch(() => { });
    }

    const scannerContainer = document.getElementById('barcode-scanner');
    scannerContainer.innerHTML = '';

    html5QrCode = new Html5Qrcode("barcode-scanner");
    html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 250 },
        (decodedText) => {
            handleScanSuccess(decodedText);
            html5QrCode.stop().catch(() => { });
        },
        (errorMessage) => {
            // Ignore scan errors
        }
    ).catch(err => {
        console.error("Camera error:", err);
        showAlert("Failed to access camera: " + err.message, "danger");
    });
}

// Common success handler
function handleScanSuccess(decodedText) {
    const resultDiv = currentScannerType === 'web'
        ? document.getElementById('scan-result')
        : document.getElementById('mobile-scan-result');

    resultDiv.textContent = `Scanned: ${decodedText}`;
    resultDiv.style.display = 'block';
    resultDiv.className = 'alert alert-success';

    document.getElementById('use-scan-result').style.display = 'block';
    document.getElementById('use-scan-result').dataset.scannedText = decodedText;
}

// Helper function to show alerts
function showAlert(message, type) {
    const container = document.getElementById('alertContainer');
    if (!container) return;

    // Create alert element
    const alert = document.createElement('div');
    alert.className = `alert-popup alert-${type}`;

    // Icon mapping
    const icons = {
        success: 'fa-circle-check',
        error: 'fa-circle-xmark',
        warning: 'fa-triangle-exclamation',
        info: 'fa-circle-info'
    };

    // Alert content
    alert.innerHTML = `
            <div class="alert-content">
                <i class="fas ${icons[type] || 'fa-circle-info'} alert-icon"></i>
                <span>${message}</span>
            </div>
            <button class="alert-close" aria-label="Close">
                <i class="fas fa-times"></i>
            </button>
            <div class="alert-progress"></div>
        `;

    // Add to container
    container.appendChild(alert);

    // Auto-remove after duration
    let timeout;
    const removeAlert = () => {
        alert.style.animation = 'fadeOut 0.3s ease-out forwards';
        setTimeout(() => alert.remove(), 300);
    };

    timeout = setTimeout(removeAlert, 5000);

    // Click to dismiss
    alert.querySelector('.alert-close').addEventListener('click', () => {
        clearTimeout(timeout);
        removeAlert();
    });
}

// Load visitor records
function loadVisitorRecords() {
    console.log("Loading visitor records...");
    showAlert('Loading visitor records...', 'info');

    fetch('/visitor/api/get_visitors')
        .then(response => {
            console.log("API response status:", response.status);
            if (!response.ok) {
                return response.json().then(err => {
                    console.error("API error:", err);
                    throw new Error(err.message || 'Server error');
                });
            }
            return response.json();
        })
        .then(data => {
            console.log("API data:", data);
            if (!data.success) {
                throw new Error(data.message || 'Failed to load data');
            }

            // Filter out checked-out visitors
            const checkedInVisitors = data.visitors.filter(visitor => !visitor.OutTime);

            if (checkedInVisitors.length === 0) {
                showAlert('No visitor records found', 'warning');
                renderNoRecords();
                return;
            }

            renderVisitorRecords(checkedInVisitors);
            showAlert(`Loaded ${checkedInVisitors.length} visitor records`, 'success');
        })
        .catch(error => {
            console.error('Error loading visitors:', error);
            showAlert(error.message, 'danger');
            renderErrorState(error.message);
        });
}

function renderNoRecords() {
    const tbody = document.getElementById('visitorsTableBody');
    tbody.innerHTML = `
            <tr>
                <td colspan="11" class="text-center py-4 text-muted">
                    <i class="fas fa-user-slash fa-2x mb-2"></i>
                    <p>No visitor records found</p>
                </td>
            </tr>
        `;
}

function renderErrorState(errorMessage) {
    const tbody = document.getElementById('visitorsTableBody');
    tbody.innerHTML = `
            <tr>
                <td colspan="11" class="text-center py-4 text-danger">
                    <i class="fas fa-exclamation-triangle fa-2x mb-2"></i>
                    <p>Failed to load records</p>
                    <small>${errorMessage}</small>
                </td>
            </tr>
        `;
}

function renderVisitorRecords(visitors) {
    const tbody = document.getElementById('visitorsTableBody');
    tbody.innerHTML = '';

    visitors.forEach(visitor => {
        const row = document.createElement('tr');

        // Photo cell
        const photoCell = document.createElement('td');
        const photoImg = document.createElement('img');
        photoImg.src = visitor.PhotoBase64 ?
            `data:image/jpeg;base64,${visitor.PhotoBase64}` :
            'https://via.placeholder.com/40';
        photoImg.className = 'visitor-photo';
        photoImg.alt = visitor.Name || 'Visitor';
        photoCell.appendChild(photoImg);

        // Create row HTML with IDCardNo
        row.innerHTML = `
                <td>${visitor.Name || '-'}</td>
                <td>${visitor.Phone || '-'}</td>
                <td>${visitor.TypeOfVisitor || '-'}</td>
                <td>${visitor.IDCardNo || '-'}</td>
                <td>${visitor.NoOfPersons || '-'}</td>
                <td>${visitor.PersonToMeet || '-'}</td>
                <td>${visitor.Purpose || '-'}</td>
                <td>${formatTime(visitor.InTime) || '-'}</td>
                <td>${visitor.OutTime ? formatTime(visitor.OutTime) : '-'}</td>
                <td>
                    <span class="badge ${visitor.OutTime ? 'bg-success' : 'bg-warning text-dark'}">
                        <i class="fas ${visitor.OutTime ? 'fa-sign-out-alt' : 'fa-sign-in-alt'} me-1"></i>
                        ${visitor.OutTime ? 'Checked Out' : 'Checked In'}
                    </span>
                </td>
                <td>
                    <button class="btn btn-sm btn-outline-primary edit-btn" data-id="${visitor.VisitorID}">
                        <i class="fas fa-sign-out-alt"></i> Check Out
                    </button>
                </td>
            `;

        // Insert photo cell at the beginning
        row.insertBefore(photoCell, row.firstChild);
        tbody.appendChild(row);
    });

    // Add event listeners to new edit buttons
    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const visitorId = this.getAttribute('data-id');
            showEditOutTimeModal(visitorId);
        });
    });
}

// Function to show edit modal
function showEditOutTimeModal(visitorId) {
    // Get visitor details first
    fetch(`/visitor/api/get_visitor_details?id=${visitorId}`)
        .then(response => response.json())
        .then(data => {
            if (!data.success) {
                throw new Error(data.message || 'Failed to load visitor details');
            }

            const visitor = data.visitor;

            // Create modal HTML with ID card info
            const modalHtml = `
                    <div class="modal fade" id="editOutTimeModal" tabindex="-1">
                        <div class="modal-dialog">
                            <div class="modal-content">
                                <div class="modal-header">
                                    <h5 class="modal-title">Check Out Visitor</h5>
                                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                                </div>
                                <div class="modal-body">
                                    <div class="row mb-3">
                                        <div class="col-md-6">
                                            <label class="form-label">Visitor Name</label>
                                            <input type="text" class="form-control" value="${visitor.Name || ''}" readonly>
                                        </div>
                                        <div class="col-md-6">
                                            <label class="form-label">ID Card No</label>
                                            <input type="text" class="form-control" id="checkoutIdCardNo" 
                                                value="${visitor.IDCardNo || ''}" readonly>
                                        </div>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">Check Out Time</label>
                                        <input type="text" class="form-control" id="editOutTime" placeholder="Select time">
                                    </div>
                                    <div id="checkoutIdCardAlert" class="alert alert-warning d-none">
                                        <i class="fas fa-exclamation-triangle me-2"></i>
                                        <span>This ID card is still in use after check-out</span>
                                    </div>
                                </div>
                                <div class="modal-footer">
                                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                                    <button type="button" class="btn btn-primary" id="saveOutTimeBtn">Confirm Check Out</button>
                                </div>
                            </div>
                        </div>
                    </div>
                `;

            // Add modal to DOM
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            const modal = new bootstrap.Modal(document.getElementById('editOutTimeModal'));

            // Initialize time picker
            flatpickr("#editOutTime", {
                enableTime: true,
                noCalendar: true,
                dateFormat: "h:i K",
                defaultDate: "now"
            });

            // Handle save button
            document.getElementById('saveOutTimeBtn').addEventListener('click', function () {
                const outTime = document.getElementById('editOutTime').value;
                if (!outTime) {
                    showAlert('Please select a check-out time', 'danger');
                    return;
                }

                updateOutTime(visitorId, outTime);
                modal.hide();
            });

            // Show modal and clean up when hidden
            modal.show();
            document.getElementById('editOutTimeModal').addEventListener('hidden.bs.modal', function () {
                this.remove();
            });
        })
        .catch(error => {
            showAlert(error.message, 'danger');
        });
}

// Function to update out time via API
function updateOutTime(visitorId, outTime) {
    // First check if ID card is still in use
    const idCardNo = document.getElementById('checkoutIdCardNo').value;

    if (idCardNo) {
        fetch(`/visitor/api/check_id_card?id_card_no=${encodeURIComponent(idCardNo)}`)
            .then(response => response.json())
            .then(data => {
                if (data.success && data.exists) {
                    // Show warning but still allow check-out
                    document.getElementById('checkoutIdCardAlert').classList.remove('d-none');
                    document.getElementById('saveOutTimeBtn').disabled = false;

                    // Ask for confirmation
                    if (!confirm('This ID card is still in use. Are you sure you want to check out this visitor?')) {
                        return;
                    }
                }

                // Proceed with check-out
                performCheckOut(visitorId, outTime);
            })
            .catch(error => {
                console.error('Error checking ID card:', error);
                // Proceed with check-out even if check fails
                performCheckOut(visitorId, outTime);
            });
    } else {
        performCheckOut(visitorId, outTime);
    }
}

function performCheckOut(visitorId, outTime) {
    fetch('/visitor/api/update_out_time', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            visitorId: visitorId,
            outTime: outTime
        })
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showAlert('Visitor checked out successfully', 'success');
                loadVisitorRecords(); // Refresh the table
            } else {
                throw new Error(data.message || 'Failed to update');
            }
        })
        .catch(error => {
            showAlert(error.message, 'danger');
        });
}

// Format time function
function formatTime(dateTimeStr) {
    if (!dateTimeStr) return '-';
    try {
        const date = new Date(dateTimeStr);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
        console.error("Error formatting time:", e);
        return dateTimeStr; // Return raw string if parsing fails
    }
}

// Tab switching functionality
function setupTabSwitching() {
    // Get all tab elements
    const tabs = {
        visitor: document.getElementById('visitorTab'),
        records: document.getElementById('recordsTab')
    };

    // Get all content sections
    const sections = {
        visitor: document.getElementById('visitorSection'),
        records: document.getElementById('recordsSection')
    };

    // Function to reset all tabs and content
    function resetAll() {
        // Hide all content sections
        Object.values(sections).forEach(section => {
            if (section) section.classList.add('d-none');
        });

        // Remove active class from all tabs
        Object.values(tabs).forEach(tab => {
            if (tab) tab.classList.remove('active');
        });
    }

    // Setup tab click handlers
    function setupTabHandler(tabId, sectionId) {
        const tab = tabs[tabId];
        const section = sections[sectionId];

        if (tab && section) {
            tab.addEventListener('click', function (e) {
                e.preventDefault();
                resetAll();
                section.classList.remove('d-none');
                tab.classList.add('active');

                // Load content if needed
                if (tabId === 'records') {
                    loadVisitorRecords();
                }
            });
        }
    }

    // Setup all tab handlers
    setupTabHandler('visitor', 'visitor');
    setupTabHandler('records', 'records');

    // Initialize visitor tab as default view
    if (tabs.visitor) tabs.visitor.click();
}

// ID Card duplicate checking functionality
$(document).ready(function () {
    const $idCardInput = $('#idCardNo');
    const $form = $('#visitorForm');
    let lastCheckedId = '';
    let checkInProgress = false;
    let duplicateFound = false;

    // Function to show ID card alert
    function showIdCardAlert(data) {
        // Remove any existing alerts first
        $('.id-card-alert').remove();

        const alertHtml = `
                <div class="alert alert-warning alert-dismissible fade show mt-2 id-card-alert" role="alert">
                    <div class="d-flex align-items-start">
                        <i class="fas fa-exclamation-triangle mt-1 me-2"></i>
                        <div>
                            <strong>Duplicate ID Card Detected!</strong>
                            <div class="mt-1">
                                <div>Visitor Name: ${data.name}</div>
                                <div>Checked In: ${data.in_time}</div>
                            </div>
                        </div>
                        <button type="button" class="btn-close ms-auto" data-bs-dismiss="alert" aria-label="Close"></button>
                    </div>
                </div>
            `;

        // Insert after the ID card input
        $idCardInput.after(alertHtml);

        // Highlight the input field
        $idCardInput.addClass('is-duplicate-id');

        // Set flag
        duplicateFound = true;
    }

    // Function to check ID card status
    function checkIdCard(idCardNo) {
        if (!idCardNo || idCardNo === lastCheckedId || checkInProgress) return;

        checkInProgress = true;
        lastCheckedId = idCardNo;
        duplicateFound = false;

        $.ajax({
            url: '/visitor/api/check_id_card',
            method: 'GET',
            data: { id_card_no: idCardNo },
            dataType: 'json',
            success: function (response) {
                if (response.success && response.exists) {
                    showIdCardAlert(response);
                } else {
                    // Clear any existing alerts
                    $('.id-card-alert').remove();
                    $idCardInput.removeClass('is-duplicate-id');
                }
            },
            error: function (xhr) {
                console.error('Error checking ID card:', xhr.responseText);
                if (xhr.status === 401) {
                    window.location.href = '/visitor/login';
                }
            },
            complete: function () {
                checkInProgress = false;
                $idCardInput.next('.spinner-border').remove();
            }
        });
    }

    // Event handlers
    $idCardInput.on('input', function () {
        const idCardNo = $(this).val().trim();
        if (idCardNo.length >= 4) {  // Check after minimum 4 characters
            checkIdCard(idCardNo);
        } else {
            $('.id-card-alert').remove();
            $idCardInput.removeClass('is-duplicate-id');
        }
    });

    // Check when leaving the field
    $idCardInput.on('blur', function () {
        const idCardNo = $(this).val().trim();
        if (idCardNo) {
            checkIdCard(idCardNo);
        }
    });

    // Prevent form submission if duplicate exists
    $form.on('submit', function (e) {
        if (duplicateFound) {
            e.preventDefault();
            showAlert('Please resolve the duplicate ID card issue before submitting', 'danger');
            $idCardInput.focus();
        }
    });

    // Handle alert dismissal
    $(document).on('click', '.id-card-alert .btn-close', function () {
        duplicateFound = false;
        $idCardInput.removeClass('is-duplicate-id');
    });
});