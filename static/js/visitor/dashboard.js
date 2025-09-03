document.addEventListener('DOMContentLoaded', function () {
    const sidebar = document.querySelector('.sidebar');
    const menuToggleBtns = document.querySelectorAll('.menu-toggle');

    // Toggle sidebar when menu buttons are clicked
    function toggleSidebar() {
        sidebar.classList.toggle('active');
        document.body.style.overflow = sidebar.classList.contains('active') ? 'hidden' : '';
    }

    // Add click event to all toggle buttons
    menuToggleBtns.forEach(btn => {
        btn.addEventListener('click', toggleSidebar);
    });

    // Close sidebar when clicking outside
    document.addEventListener('click', function (event) {
        const isClickInsideSidebar = sidebar.contains(event.target);
        const isClickOnMenuBtn = Array.from(menuToggleBtns).some(btn => btn.contains(event.target));

        if (!isClickInsideSidebar && !isClickOnMenuBtn && sidebar.classList.contains('active')) {
            toggleSidebar();
        }
    });

    // Close sidebar when resizing to desktop
    function handleResize() {
        if (window.innerWidth >= 992) {
            sidebar.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    window.addEventListener('resize', handleResize);

    // ===== Global Variables =====
    let visitorChart, typeChart;
    let requestsModal = new bootstrap.Modal(document.getElementById('requestsModal'));
    let notificationCount = 0;

    // ===== Init =====
    updateNotificationCount();
    loadCharts();
    setInterval(updateNotificationCount, 300000);

    // ===== Time Period Buttons =====
    document.querySelectorAll('.time-filter-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            document.querySelectorAll('.time-filter-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            loadCharts();
        });
    });

    // ===== Notification Click =====
    document.querySelector('.notification').addEventListener('click', async function () {
        await showRequestsModal();
    });

    // ===== Helper Functions =====
    function formatDate(dateString) {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    }

    function formatTime(timeString) {
        if (!timeString) return 'N/A';
        if (timeString.includes('T')) timeString = timeString.split('T')[1];
        return timeString.substring(0, 5);
    }

    async function showRequestsModal() {
        try {
            document.getElementById('requestsTableBody').innerHTML = `
                        <tr>
                            <td colspan="5" class="text-center py-4">
                                <div class="spinner-border text-primary" role="status">
                                    <span class="visually-hidden">Loading...</span>
                                </div>
                            </td>
                        </tr>`;
            requestsModal.show();

            const response = await fetch('/visitor/api/get_pending_requests_details');
            if (!response.ok) throw new Error('Failed to fetch requests');

            const data = await response.json();
            if (!data.success) throw new Error(data.message || 'Failed to load requests');

            renderRequests(data.requests);
            notificationCount = data.requests?.length || 0;
            updateNotificationBadge(notificationCount);

        } catch (error) {
            console.error('Error loading requests:', error);
            document.getElementById('requestsTableBody').innerHTML = `
                        <tr>
                            <td colspan="5" class="text-center text-danger py-4">
                                Error loading requests: ${error.message}
                            </td>
                        </tr>`;
        }
    }

    function updateNotificationBadge(count) {
        const badge = document.querySelector('.notification-badge');
        if (!badge) return;

        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }

    async function updateNotificationCount() {
        try {
            const response = await fetch('/visitor/api/get_pending_requests');
            if (!response.ok) throw new Error('Failed to fetch notification count');

            const data = await response.json();
            if (data.success) {
                notificationCount = data.count || 0;
                updateNotificationBadge(notificationCount);
            } else {
                throw new Error(data.message || 'Failed to get notification count');
            }
        } catch (error) {
            console.error('Error updating notification count:', error);
            updateNotificationBadge(0);
        }
    }

    function renderRequests(requests) {
        const tbody = document.getElementById('requestsTableBody');
        if (!requests || requests.length === 0) {
            tbody.innerHTML = `
                        <tr>
                            <td colspan="5" class="text-center py-4 text-muted">
                                No pending visitor requests
                            </td>
                        </tr>`;
            return;
        }

        tbody.innerHTML = requests.map(request => `
                    <tr data-request-id="${request.requestId}">
                        <td>${request.requesterName}</td>
                        <td>${request.visitorName || 'N/A'}</td>
                        <td>${request.purpose || 'N/A'}</td>
                        <td>${formatDate(request.eventDate)}</td>
                        <td>${formatTime(request.eventTime)}</td>
                        <td>
                            <div class="btn-group btn-group-sm">
                                <button class="btn btn-success approve-btn" title="Approve"><i class="fas fa-check"></i></button>
                                <button class="btn btn-danger reject-btn" title="Reject"><i class="fas fa-times"></i></button>
                            </div>
                        </td>
                    </tr>`).join('');

        document.querySelectorAll('.approve-btn').forEach(btn => {
            btn.addEventListener('click', (e) => handleRequestAction(e, 'Approved'));
        });
        document.querySelectorAll('.reject-btn').forEach(btn => {
            btn.addEventListener('click', (e) => handleRequestAction(e, 'Rejected'));
        });
    }

    async function handleRequestAction(event, action) {
        event.preventDefault();
        event.stopPropagation();

        const row = event.target.closest('tr');
        const requestId = row.dataset.requestId;
        let responseNotes = '';

        if (action === 'Rejected') {
            const reason = await showRejectionReasonModal();
            if (reason === null) return;
            responseNotes = reason;
        }

        try {
            row.innerHTML = `
                        <td colspan="5" class="text-center py-2">
                            <div class="spinner-border spinner-border-sm" role="status">
                                <span class="visually-hidden">Processing...</span>
                            </div>
                        </td>`;

            const response = await fetch('/visitor/api/update_request_status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requestId, status: action, responseNotes })
            });

            if (!response.ok) throw new Error('Network response was not ok');
            const result = await response.json();
            if (!result.success) throw new Error(result.message || 'Action failed');

            row.remove();
            notificationCount = Math.max(0, notificationCount - 1);
            updateNotificationBadge(notificationCount);

        } catch (error) {
            console.error('Error updating request:', error);
            row.innerHTML = `
                        <td colspan="5" class="text-center text-danger py-2">
                            Error: ${error.message}
                            <button class="btn btn-sm btn-primary ms-2" onclick="window.location.reload()">Retry</button>
                        </td>`;
        }
    }

    function showRejectionReasonModal() {
        return new Promise((resolve) => {
            const modalHTML = `
                        <div class="modal fade" id="rejectionReasonModal" tabindex="-1" aria-hidden="true">
                            <div class="modal-dialog">
                                <div class="modal-content">
                                    <div class="modal-header bg-danger text-white">
                                        <h5 class="modal-title">Reason for Rejection</h5>
                                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                                    </div>
                                    <div class="modal-body">
                                        <textarea class="form-control" id="rejectionReasonText" rows="3" required></textarea>
                                    </div>
                                    <div class="modal-footer">
                                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                                        <button type="button" class="btn btn-danger" id="confirmRejection">Submit</button>
                                    </div>
                                </div>
                            </div>
                        </div>`;
            document.body.insertAdjacentHTML('beforeend', modalHTML);

            const modalEl = document.getElementById('rejectionReasonModal');
            const modal = new bootstrap.Modal(modalEl);

            modalEl.addEventListener('shown.bs.modal', () => {
                document.getElementById('rejectionReasonText').focus();
            });

            document.getElementById('confirmRejection').addEventListener('click', () => {
                const reason = document.getElementById('rejectionReasonText').value.trim();
                if (reason) {
                    modal.hide();
                    resolve(reason);
                } else {
                    alert('Please enter a reason for rejection');
                }
            });

            modalEl.addEventListener('hidden.bs.modal', () => {
                modal.dispose();
                modalEl.remove();
                document.querySelectorAll('.modal-backdrop').forEach(el => el.remove()); // cleanup backdrop
                resolve(null);
            });

            modal.show();
        });
    }

    // ===== Chart Functions =====
    async function loadCharts() {
        try {
            showLoadingState();
            const response = await fetch('/visitor/api/get_visitors');
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

            const data = await response.json();
            if (!data.success) throw new Error('API returned unsuccessful response');

            renderCharts(data.visitors);
        } catch (error) {
            console.error('Error loading charts:', error);
            showErrorState(error.message);
        }
    }

    function renderCharts(visitors) {
        if (!visitors || visitors.length === 0) {
            showErrorState('No visitor data available');
            return;
        }

        const lineData = processLineChartData(visitors);
        const pieData = processPieChartData(visitors);

        if (visitorChart) visitorChart.destroy();
        if (typeChart) typeChart.destroy();

        visitorChart = new Chart(document.getElementById('visitorChart').getContext('2d'), {
            type: 'line',
            data: {
                labels: lineData.labels,
                datasets: [{
                    label: 'Visitors',
                    data: lineData.values,
                    backgroundColor: 'rgba(40, 98, 58, 0.1)',
                    borderColor: 'rgba(40, 98, 58, 1)',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: true
                }]
            },
            options: getLineChartOptions()
        });

        typeChart = new Chart(document.getElementById('visitorTypeChart').getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: pieData.labels,
                datasets: [{
                    data: pieData.values,
                    backgroundColor: pieData.colors,
                    borderWidth: 0
                }]
            },
            options: getPieChartOptions()
        });
    }

    function processLineChartData(visitors) {
        const dateCounts = {};
        visitors.forEach(visitor => {
            if (visitor.InTime) {
                const date = new Date(visitor.InTime);
                const dateStr = `${date.getDate()}/${date.getMonth() + 1}`;
                dateCounts[dateStr] = (dateCounts[dateStr] || 0) + 1;
            }
        });
        return { labels: Object.keys(dateCounts), values: Object.values(dateCounts) };
    }

    function processPieChartData(visitors) {
        const typeCounts = {};
        visitors.forEach(visitor => {
            const type = visitor.TypeOfVisitor || 'Unknown';
            typeCounts[type] = (typeCounts[type] || 0) + 1;
        });
        return {
            labels: Object.keys(typeCounts),
            values: Object.values(typeCounts),
            colors: [
                'rgba(40, 98, 58, 0.8)',
                'rgba(32, 58, 67, 0.8)',
                'rgba(223, 180, 165, 0.8)',
                'rgba(193, 54, 64, 0.8)'
            ].slice(0, Object.keys(typeCounts).length)
        };
    }

    function getLineChartOptions() {
        return {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: ctx => `Visitors: ${ctx.raw}` } }
            },
            scales: { y: { beginAtZero: true }, x: { grid: { display: false } } }
        };
    }

    function getPieChartOptions() {
        return {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { padding: 20, usePointStyle: true }
                }
            },
            cutout: '70%'
        };
    }

    function showLoadingState() {
        const loadingHTML = `
                    <div class="chart-loading">
                        <div class="spinner-border text-primary" role="status">
                            <span class="visually-hidden">Loading...</span>
                        </div>
                    </div>`;
        document.getElementById('visitorChart').innerHTML = loadingHTML;
        document.getElementById('visitorTypeChart').innerHTML = loadingHTML;
    }

    function showErrorState(message) {
        const errorHTML = `
                    <div class="chart-error text-danger">
                        <i class="fas fa-exclamation-triangle"></i>
                        <p>${message}</p>
                        <button class="btn btn-sm btn-primary mt-2" onclick="loadCharts()">Retry</button>
                    </div>`;
        document.getElementById('visitorChart').innerHTML = errorHTML;
        document.getElementById('visitorTypeChart').innerHTML = errorHTML;
    }
});