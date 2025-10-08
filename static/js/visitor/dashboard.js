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
    let currentTimeFilter = 'week'; // Default filter

    // ===== Init =====
    updateNotificationCount();
    loadCharts();
    setInterval(updateNotificationCount, 300000);

    // Add this for real-time chart updates every 60 seconds
    setInterval(loadCharts, 60000);

    // ===== Time Period Buttons =====
    document.querySelectorAll('.time-filter-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            document.querySelectorAll('.time-filter-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');

            // Set current time filter based on button text
            currentTimeFilter = this.textContent.toLowerCase();
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

    // ===== Date Range Calculation Functions =====
    function getDateRangeForFilter(filterType) {
        const now = new Date();
        let startDate, endDate;

        switch (filterType) {
            case 'week':
                // Previous week (last 7 days excluding today)
                endDate = new Date(now);
                endDate.setDate(now.getDate() - 1); // Yesterday
                startDate = new Date(endDate);
                startDate.setDate(endDate.getDate() - 6); // 7 days ago
                break;

            case 'month':
                // Previous month
                endDate = new Date(now.getFullYear(), now.getMonth(), 0); // Last day of previous month
                startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1); // First day of previous month
                break;

            case 'day':
            default:
                // Previous day (yesterday)
                startDate = new Date(now);
                startDate.setDate(now.getDate() - 1);
                endDate = new Date(startDate);
                break;
        }

        return {
            start: startDate.toISOString().split('T')[0],
            end: endDate.toISOString().split('T')[0]
        };
    }

    function getChartLabelsForFilter(filterType, visitors) {
        switch (filterType) {
            case 'week':
                // Last 7 days
                const weekLabels = [];
                for (let i = 6; i >= 0; i--) {
                    const date = new Date();
                    date.setDate(date.getDate() - i);
                    weekLabels.push(date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }));
                }
                return weekLabels;

            case 'month':
                // Last 4 weeks or specific month periods
                const monthLabels = [];
                const now = new Date();
                const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

                // Get weeks of previous month
                const firstDay = new Date(prevMonth.getFullYear(), prevMonth.getMonth(), 1);
                const lastDay = new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0);

                let currentWeekStart = new Date(firstDay);
                while (currentWeekStart <= lastDay) {
                    const weekEnd = new Date(currentWeekStart);
                    weekEnd.setDate(currentWeekStart.getDate() + 6);
                    if (weekEnd > lastDay) weekEnd.setDate(lastDay.getDate());

                    monthLabels.push(`Week ${Math.ceil((currentWeekStart.getDate() + firstDay.getDay()) / 7)}`);
                    currentWeekStart.setDate(currentWeekStart.getDate() + 7);
                }
                return monthLabels;

            case 'day':
            default:
                // Last 24 hours in 4-hour intervals
                return ['12AM-4AM', '4AM-8AM', '8AM-12PM', '12PM-4PM', '4PM-8PM', '8PM-12AM'];
        }
    }

    function processDataForTimeFilter(visitors, filterType) {
        const dateRange = getDateRangeForFilter(filterType);
        const startDate = new Date(dateRange.start);
        const endDate = new Date(dateRange.end);
        endDate.setHours(23, 59, 59, 999); // End of the day

        // Filter visitors for the selected time period
        const filteredVisitors = visitors.filter(visitor => {
            if (!visitor.InTime) return false;
            const visitorDate = new Date(visitor.InTime);
            return visitorDate >= startDate && visitorDate <= endDate;
        });

        // Process data based on filter type
        switch (filterType) {
            case 'week':
                return processWeeklyData(filteredVisitors, dateRange);

            case 'month':
                return processMonthlyData(filteredVisitors, dateRange);

            case 'day':
            default:
                return processDailyData(filteredVisitors);
        }
    }

    function processWeeklyData(visitors, dateRange) {
        const dailyCounts = {};
        const startDate = new Date(dateRange.start);
        const endDate = new Date(dateRange.end);

        // Initialize daily counts for the entire week
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            const dateKey = d.toISOString().split('T')[0];
            dailyCounts[dateKey] = 0;
        }

        // Count visitors per day
        visitors.forEach(visitor => {
            if (visitor.InTime) {
                const visitorDate = new Date(visitor.InTime).toISOString().split('T')[0];
                if (dailyCounts[visitorDate] !== undefined) {
                    dailyCounts[visitorDate]++;
                }
            }
        });

        // Convert to arrays for chart
        const labels = Object.keys(dailyCounts).map(date => {
            const d = new Date(date);
            return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        });

        const values = Object.values(dailyCounts);

        return { labels, values };
    }

    function processMonthlyData(visitors, dateRange) {
        const weeklyCounts = {};
        const startDate = new Date(dateRange.start);
        const endDate = new Date(dateRange.end);

        // Initialize weekly counts
        let currentWeekStart = new Date(startDate);
        let weekNumber = 1;

        while (currentWeekStart <= endDate) {
            const weekEnd = new Date(currentWeekStart);
            weekEnd.setDate(currentWeekStart.getDate() + 6);
            if (weekEnd > endDate) weekEnd.setDate(endDate.getDate());

            weeklyCounts[`Week ${weekNumber}`] = 0;
            currentWeekStart.setDate(currentWeekStart.getDate() + 7);
            weekNumber++;
        }

        // Count visitors per week
        visitors.forEach(visitor => {
            if (visitor.InTime) {
                const visitorDate = new Date(visitor.InTime);
                const weekStart = new Date(dateRange.start);
                let weekNum = 1;

                while (weekStart <= endDate) {
                    const weekEnd = new Date(weekStart);
                    weekEnd.setDate(weekStart.getDate() + 6);
                    if (weekEnd > endDate) weekEnd.setDate(endDate.getDate());

                    if (visitorDate >= weekStart && visitorDate <= weekEnd) {
                        weeklyCounts[`Week ${weekNum}`]++;
                        break;
                    }

                    weekStart.setDate(weekStart.getDate() + 7);
                    weekNum++;
                }
            }
        });

        const labels = Object.keys(weeklyCounts);
        const values = Object.values(weeklyCounts);

        return { labels, values };
    }

    function processDailyData(visitors) {
        const hourlyCounts = {
            '12AM-4AM': 0, '4AM-8AM': 0, '8AM-12PM': 0,
            '12PM-4PM': 0, '4PM-8PM': 0, '8PM-12AM': 0
        };

        visitors.forEach(visitor => {
            if (visitor.InTime) {
                const visitorTime = new Date(visitor.InTime);
                const hours = visitorTime.getHours();

                if (hours >= 0 && hours < 4) hourlyCounts['12AM-4AM']++;
                else if (hours >= 4 && hours < 8) hourlyCounts['4AM-8AM']++;
                else if (hours >= 8 && hours < 12) hourlyCounts['8AM-12PM']++;
                else if (hours >= 12 && hours < 16) hourlyCounts['12PM-4PM']++;
                else if (hours >= 16 && hours < 20) hourlyCounts['4PM-8PM']++;
                else hourlyCounts['8PM-12AM']++;
            }
        });

        const labels = Object.keys(hourlyCounts);
        const values = Object.values(hourlyCounts);

        return { labels, values };
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
            const response = await fetch('/visitor/api/get_visitors_chart');
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

        // Process data based on current time filter
        const lineData = processDataForTimeFilter(visitors, currentTimeFilter);
        const pieData = processPieChartData(visitors, currentTimeFilter);

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
            options: getLineChartOptions(currentTimeFilter)
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

    function processPieChartData(visitors, filterType) {
        const dateRange = getDateRangeForFilter(filterType);
        const startDate = new Date(dateRange.start);
        const endDate = new Date(dateRange.end);
        endDate.setHours(23, 59, 59, 999);

        // Filter visitors for the selected time period
        const filteredVisitors = visitors.filter(visitor => {
            if (!visitor.InTime) return false;
            const visitorDate = new Date(visitor.InTime);
            return visitorDate >= startDate && visitorDate <= endDate;
        });

        const typeCounts = {};
        filteredVisitors.forEach(visitor => {
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
                'rgba(193, 54, 64, 0.8)',
                'rgba(106, 76, 147, 0.8)',
                'rgba(24, 100, 171, 0.8)'
            ].slice(0, Object.keys(typeCounts).length)
        };
    }

    function getLineChartOptions(filterType) {
        return {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => `Visitors: ${ctx.raw}`
                    }
                },
                title: {
                    display: true,
                    text: getChartTitle(filterType),
                    font: { size: 14, weight: 'normal' },
                    padding: 10
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Number of Visitors'
                    }
                },
                x: {
                    grid: { display: false },
                    title: {
                        display: true,
                        text: getXAxisTitle(filterType)
                    }
                }
            }
        };
    }

    function getChartTitle(filterType) {
        const dateRange = getDateRangeForFilter(filterType);
        const start = new Date(dateRange.start).toLocaleDateString();
        const end = new Date(dateRange.end).toLocaleDateString();

        switch (filterType) {
            case 'week': return `Weekly Visitors (${start} to ${end})`;
            case 'month': return `Monthly Visitors (${start} to ${end})`;
            case 'day': return `Daily Visitors (${start})`;
            default: return 'Visitor Trends';
        }
    }

    function getXAxisTitle(filterType) {
        switch (filterType) {
            case 'week': return 'Days';
            case 'month': return 'Weeks';
            case 'day': return 'Time Periods';
            default: return 'Time';
        }
    }

    function getPieChartOptions() {
        return {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { padding: 20, usePointStyle: true }
                },
                title: {
                    display: true,
                    text: 'Visitor Types Distribution',
                    font: { size: 14, weight: 'normal' },
                    padding: 10
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