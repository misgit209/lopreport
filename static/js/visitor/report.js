// Toggle sidebar on mobile
document.querySelectorAll('.menu-toggle').forEach(button => {
    button.addEventListener('click', function () {
        document.querySelector('.sidebar').classList.toggle('active');
    });
});

// Close sidebar when clicking outside on mobile
document.addEventListener('click', function (event) {
    const sidebar = document.querySelector('.sidebar');
    const isClickInsideSidebar = sidebar.contains(event.target);
    const isClickOnMenuToggle = event.target.closest('.menu-toggle');

    if (!isClickInsideSidebar && !isClickOnMenuToggle && window.innerWidth < 992) {
        sidebar.classList.remove('active');
    }
});

$(document).ready(function () {
    // Set default dates (today)
    const today = new Date().toISOString().split('T')[0];
    $('#reportFromDate').val('');
    $('#reportToDate').val('');

    // Generate report button click handler
    $('#generateReportBtn').click(function () {
        $('#generateReportBtn').html('<span class="loading-spinner me-2"></span> Generating...');
        $('#generateReportBtn').prop('disabled', true);

        generateReport().finally(() => {
            $('#generateReportBtn').html('<i class="fas fa-filter me-1"></i> Generate');
            $('#generateReportBtn').prop('disabled', false);
        });
    });

    // Export button click handler
    $('#exportBtn').click(function () {
        exportReport();
    });
});

async function generateReport() {
    const fromDate = $('#reportFromDate').val();
    const toDate = $('#reportToDate').val();
    const visitorType = $('#visitorTypeFilter').val();

    if (!fromDate || !toDate) {
        showAlert('Please select both From and To dates', 'danger');
        return;
    }

    if (new Date(toDate) < new Date(fromDate)) {
        showAlert('To date must be after From date', 'danger');
        return;
    }

    $('#reportsTableBody').html(`
                <tr>
                    <td colspan="11" class="text-center py-4">
                        <span class="loading-spinner"></span>
                        <p class="mt-2">Loading report data...</p>
                    </td>
                </tr>
            `);

    try {
        const response = await fetch(`/visitor/api/get_visitor_reports?from=${fromDate}&to=${toDate}`);
        if (!response.ok) throw new Error('Network response was not ok');

        const data = await response.json();
        if (!data.success) throw new Error(data.message || 'Failed to load data');

        let visitors = data.visitors || [];

        if (visitorType) {
            visitors = visitors.filter(v =>
                v.TypeOfVisitor && v.TypeOfVisitor.toLowerCase() === visitorType.toLowerCase()
            );
        }

        if (visitors.length === 0) {
            $('#reportsTableBody').html(`
                        <tr>
                            <td colspan="11" class="no-records">
                                <i class="fas fa-user-slash"></i>
                                <p>No matching records found</p>
                                <small>Try different filters</small>
                            </td>
                        </tr>
                    `);
            return;
        }

        renderVisitorTable(visitors);

    } catch (error) {
        console.error('Error loading visitor reports:', error);
        $('#reportsTableBody').html(`
                    <tr>
                        <td colspan="11" class="text-center py-4 text-danger">
                            <i class="fas fa-exclamation-triangle fa-2x mb-2"></i>
                            <p>Failed to load reports</p>
                            <small>${error.message}</small>
                        </td>
                    </tr>
                `);
    }
}

function renderVisitorTable(visitors) {
    const rows = visitors.map(visitor => {
        const duration = calculateDuration(visitor.InTime, visitor.OutTime);
        const photoSrc = visitor.PhotoBase64
            ? `data:image/jpeg;base64,${visitor.PhotoBase64}`
            : 'https://ui-avatars.com/api/?name=' + encodeURIComponent(visitor.Name || 'V') + '&background=' + encodeURIComponent('e2f3e8') + '&color=' + encodeURIComponent('28623A');

        return `
                    <tr>
                        <td><img src="${photoSrc}" class="visitor-photo" alt="${visitor.Name}" loading="lazy"></td>
                        <td>${visitor.Name || '-'}</td>
                        <td>${visitor.Phone || '-'}</td>
                        <td><span class="badge bg-primary-dark text-primary-dark">${visitor.TypeOfVisitor || '-'}</span></td>
                        <td>${visitor.Address || '-'}</td>
                        <td>${visitor.NoOfPersons || '-'}</td>
                        <td>${visitor.PersonToMeet || '-'}</td>
                        <td>${visitor.Purpose || '-'}</td>
                        <td>${formatDateTime(visitor.InTime)}</td>
                        <td>${formatDateTime(visitor.OutTime)}</td>
                        <td><span class="duration-badge">${duration}</span></td>
                    </tr>
                `;
    }).join('');

    $('#reportsTableBody').html(rows);
}

function exportReport() {
    const fromDate = $('#reportFromDate').val();
    const toDate = $('#reportToDate').val();
    const visitorType = $('#visitorTypeFilter').val();

    if (!fromDate || !toDate) {
        showAlert('Please select date range before exporting', 'warning');
        return;
    }

    // Show loading state
    const exportBtn = $('#exportBtn');
    exportBtn.html('<span class="loading-spinner me-2"></span> Exporting...');
    exportBtn.prop('disabled', true);

    // Build the export URL
    let exportUrl = `/visitor/api/export_visitor_reports?from=${fromDate}&to=${toDate}`;
    if (visitorType) {
        exportUrl += `&type=${visitorType}`;
    }

    // Use fetch API to handle the download
    fetch(exportUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error(response.status === 401 ? 'Session expired. Please login again.' :
                    'Failed to export report');
            }
            return response.blob();
        })
        .then(blob => {
            // Create download link
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `visitor_report_${fromDate}_to_${toDate}.xlsx`;
            document.body.appendChild(a);
            a.click();

            // Clean up
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        })
        .catch(error => {
            console.error('Export error:', error);
            showAlert(error.message, 'danger');

            // If unauthorized, redirect to login
            if (error.message.includes('Session expired')) {
                setTimeout(() => window.location.href = '/visitor/login', 2000);
            }
        })
        .finally(() => {
            // Reset button state
            exportBtn.html('<i class="fas fa-file-export me-1 d-none d-md-inline"></i> Export');
            exportBtn.prop('disabled', false);
        });
}

function formatDateTime(dateTimeStr) {
    if (!dateTimeStr) return '-';
    const date = new Date(dateTimeStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
}

function calculateDuration(inTime, outTime) {
    if (!inTime || !outTime) return '-';
    const diffMs = new Date(outTime) - new Date(inTime);
    if (diffMs <= 0) return '0m';
    const diffMins = Math.floor(diffMs / 60000);
    return diffMins < 60
        ? `${diffMins}m`
        : `${Math.floor(diffMins / 60)}h ${diffMins % 60}m`;
}

function showAlert(message, type) {
    $('.custom-alert').remove();
    const alertHtml = `
                <div class="custom-alert alert alert-${type} alert-dismissible fade show" role="alert">
                    <div class="d-flex align-items-center">
                        <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'} me-2"></i>
                        <div>${message}</div>
                        <button type="button" class="btn-close ms-auto" data-bs-dismiss="alert"></button>
                    </div>
                </div>
            `;
    $('body').append(alertHtml);
    setTimeout(() => $('.custom-alert').alert('close'), 5000);
}