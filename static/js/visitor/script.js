// Global variables for scanner
let currentInputField = null;
let html5QrCode = null;
let currentScannerType = 'web';

// Initialize time pickers
flatpickr("#inTime", {
    enableTime: true,
    noCalendar: true,
    dateFormat: "h:i K",
    defaultDate: "now"
});

flatpickr("#outTime", {
    enableTime: true,
    noCalendar: true,
    dateFormat: "h:i K"
});

// Tab switching functionality
document.getElementById('visitorTab').addEventListener('click', function (e) {
    e.preventDefault();
    document.getElementById('recordsSection').classList.add('d-none');
    document.getElementById('reportsContentSection').classList.add('d-none');
    document.getElementById('visitorSection').classList.remove('d-none');
    this.classList.add('active');
    document.getElementById('recordsTab').classList.remove('active');
    document.getElementById('reportsTab').classList.remove('active');
    window.scrollTo(0, 0);
});

document.getElementById('recordsTab').addEventListener('click', function (e) {
    e.preventDefault();
    document.getElementById('visitorSection').classList.add('d-none');
    document.getElementById('reportsContentSection').classList.add('d-none');
    document.getElementById('recordsSection').classList.remove('d-none');
    this.classList.add('active');
    document.getElementById('visitorTab').classList.remove('active');
    document.getElementById('reportsTab').classList.remove('active');
    window.scrollTo(0, 0);

    // Load records when the tab is clicked
    loadVisitorRecords();
});

document.getElementById('reportsTab').addEventListener('click', function (e) {
    e.preventDefault();
    document.getElementById('visitorSection').classList.add('d-none');
    document.getElementById('recordsSection').classList.add('d-none');
    document.getElementById('reportsContentSection').classList.remove('d-none');
    this.classList.add('active');
    document.getElementById('visitorTab').classList.remove('active');
    document.getElementById('recordsTab').classList.remove('active');

    // Set default dates (last 7 days)
    const today = new Date();
    const lastWeek = new Date();
    lastWeek.setDate(today.getDate() - 7);

    document.getElementById('reportFromDate').value = '';
    document.getElementById('reportToDate').value = '';

    // Load initial report
    generateReport();
});

// Floating button scroll to form
document.getElementById('addVisitorBtn').addEventListener('click', function () {
    document.getElementById('visitorTab').click();
    document.querySelector('#visitorForm').scrollIntoView({
        behavior: 'smooth'
    });
});

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
                document.getElementById('photoPreview').src = 'https://via.placeholder.com/80';
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

// Helper function to show alerts
function showAlert(message, type) {
    // Remove any existing alerts first
    const existingAlerts = document.querySelectorAll('.custom-alert');
    existingAlerts.forEach(alert => alert.remove());

    const alertHtml = `
                <div class="custom-alert alert alert-${type} alert-dismissible fade show" role="alert" 
                     style="position: fixed; top: 20px; right: 20px; z-index: 9999; min-width: 300px;">
                    <div class="d-flex align-items-center">
                        <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'} me-2"></i>
                        <div>${message}</div>
                        <button type="button" class="btn-close ms-auto" data-bs-dismiss="alert"></button>
                    </div>
                </div>
            `;

    document.body.insertAdjacentHTML('beforeend', alertHtml);

    // Auto-remove after 5 seconds
    setTimeout(() => {
        const alert = document.querySelector('.custom-alert');
        if (alert) {
            alert.remove();
        }
    }, 5000);
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
                    <td colspan="9" class="text-center py-4 text-muted">
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
                    <td colspan="9" class="text-center py-4 text-danger">
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

        // Status badge
        const statusBadge = visitor.OutTime ?
            '<span class="badge bg-success"><i class="fas fa-sign-out-alt me-1"></i>Checked Out</span>' :
            '<span class="badge bg-warning text-dark"><i class="fas fa-sign-in-alt me-1"></i>Checked In</span>';

        // Create row HTML
        row.innerHTML = `
                    <td>${visitor.Name || '-'}</td>
                    <td>${visitor.Phone || '-'}</td>
                    <td>${visitor.PersonToMeet || '-'}</td>
                    <td>${visitor.Purpose || '-'}</td>
                    <td>${formatTime(visitor.InTime) || '-'}</td>
                    <td>${visitor.OutTime ? formatTime(visitor.OutTime) : '-'}</td>
                    <td>${statusBadge}</td>
                    <td>
                        <button class="btn btn-sm btn-outline-primary edit-btn" data-id="${visitor.VisitorID}">
                            <i class="fas fa-edit"></i> Edit
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

// Add this new function for the edit modal
function showEditOutTimeModal(visitorId) {
    // Create modal HTML
    const modalHtml = `
                <div class="modal fade" id="editOutTimeModal" tabindex="-1">
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">Update Check-Out Time</h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body">
                                <div class="mb-3">
                                    <label class="form-label">New Out Time</label>
                                    <input type="text" class="form-control" id="editOutTime" placeholder="Select time">
                                </div>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                                <button type="button" class="btn btn-primary" id="saveOutTimeBtn">Save</button>
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
}

// Function to update out time via API
function updateOutTime(visitorId, outTime) {
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
                showAlert('Check-out time updated successfully', 'success');
                loadVisitorRecords(); // Refresh the table
            } else {
                throw new Error(data.message || 'Failed to update');
            }
        })
        .catch(error => {
            showAlert(error.message, 'danger');
        });
}

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

// Logout button
document.querySelector('.btn-logout').addEventListener('click', function () {
    if (confirm('Are you sure you want to logout?')) {
        window.location.href = '/visitor/logout';
    }
});

// Export button
document.getElementById('exportBtn').addEventListener('click', function () {
    showAlert('Exporting visitor records...', 'info');
});

// Add search functionality
document.getElementById('searchBtn').addEventListener('click', searchVisitors);
document.getElementById('searchInput').addEventListener('keyup', function (e) {
    if (e.key === 'Enter') {
        searchVisitors();
    }
});

function searchVisitors() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    if (!searchTerm) {
        loadVisitorRecords();
        return;
    }

    fetch('/visitor/api/get_visitors')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const filtered = data.visitors.filter(visitor =>
                    (visitor.Name && visitor.Name.toLowerCase().includes(searchTerm)) ||
                    (visitor.Phone && visitor.Phone.toLowerCase().includes(searchTerm))
                );
                renderVisitorRecords(filtered);
            }
        })
        .catch(error => {
            showAlert('Error searching visitors: ' + error.message, 'danger');
        });
}

// Report generation function
function generateReport() {
    const fromDate = document.getElementById('reportFromDate').value;
    const toDate = document.getElementById('reportToDate').value;

    if (!fromDate || !toDate) {
        showAlert('Please select both date ranges', 'warning');
        return;
    }

    fetch(`/visitor/api/get_visitor_reports?from=${fromDate}&to=${toDate}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                renderReport(data.visitors);
            } else {
                throw new Error(data.message || 'Failed to load report');
            }
        })
        .catch(error => {
            showAlert(error.message, 'danger');
        });
}

// Render report data
function renderReport(visitors) {
    const tbody = document.getElementById('reportsTableBody');
    tbody.innerHTML = '';

    visitors.forEach(visitor => {
        const row = document.createElement('tr');

        // Calculate duration
        let duration = '-';
        if (visitor.InTime && visitor.OutTime) {
            const inTime = new Date(visitor.InTime);
            const outTime = new Date(visitor.OutTime);
            const diffMs = outTime - inTime;
            const diffMins = Math.round(diffMs / 60000);
            duration = `${diffMins} mins`;
        }

        // Photo cell
        const photoCell = document.createElement('td');
        const photoImg = document.createElement('img');
        photoImg.src = visitor.PhotoBase64 ?
            `data:image/jpeg;base64,${visitor.PhotoBase64}` :
            'https://via.placeholder.com/40';
        photoImg.className = 'visitor-photo';
        photoImg.alt = visitor.Name || 'Visitor';
        photoCell.appendChild(photoImg);

        row.innerHTML = `
                    <td>${visitor.Name || '-'}</td>
                    <td>${visitor.Phone || '-'}</td>
                    <td>${visitor.PersonToMeet || '-'}</td>
                    <td>${visitor.Purpose || '-'}</td>
                    <td>${formatTime(visitor.InTime) || '-'}</td>
                    <td>${visitor.OutTime ? formatTime(visitor.OutTime) : '-'}</td>
                    <td>${duration}</td>
                `;

        row.insertBefore(photoCell, row.firstChild);
        tbody.appendChild(row);
    });
}

// Add event listener for report generation
document.getElementById('generateReportBtn').addEventListener('click', generateReport);
