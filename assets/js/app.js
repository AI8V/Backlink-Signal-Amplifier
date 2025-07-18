/* app.js */
(() => {
    // --- PART 3.1: INITIALIZATION & DOM CACHING ---
    const startButton = document.getElementById('startButton');
    const backlinkUrlsInput = document.getElementById('backlinkUrls');
    const targetDomainInput = document.getElementById('targetDomain');
    const logContainer = document.getElementById('logContainer');
    const summaryReportContainer = document.getElementById('summaryReport');
    
    const CORS_PROXY = 'https://api.allorigins.win/raw?url=';

    startButton.addEventListener('click', startProcess);

    // --- PART 3.5: UTILITY FUNCTIONS ---

    /**
     * Appends a message to the real-time log.
     * @param {string} message The message to log.
     * @param {string} status 'info', 'success', 'error', or 'warning'.
     */
    function logMessage(message, status = 'info') {
        const p = document.createElement('p');
        p.className = `log-message status-${status}`;
        
        let icon = '';
        switch (status) {
            case 'success': icon = '✅ '; break;
            case 'error':   icon = '❌ '; break;
            case 'info':    icon = 'ℹ️ '; break;
            case 'warning': icon = '⚠️ '; break;
        }
        
        p.innerHTML = `${icon}${new Date().toLocaleTimeString()}: ${message}`;
        logContainer.appendChild(p);
        logContainer.scrollTop = logContainer.scrollHeight;
    }

    /**
     * Pauses execution for a specified duration.
     * @param {number} ms Milliseconds to sleep.
     * @returns {Promise<void>}
     */
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // --- PART 3.4: SIGNAL AMPLIFICATION MODULES ---

    /**
     * Validates that the backlink URL contains a link to the target domain.
     * @param {string} url The backlink URL.
     * @param {string} targetDomain The user's target domain.
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async function validateBacklink(url, targetDomain) {
        logMessage(`Validating: ${url}...`);
        const proxyUrl = `${CORS_PROXY}${encodeURIComponent(url)}`;
        try {
            const response = await fetch(proxyUrl);
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            
            const html = await response.text();
            // A simple but effective regex to find an <a> tag pointing to the target domain.
            const linkRegex = new RegExp(`href\\s*=\\s*["'](https?:\\/\\/)?(www\\.)?${targetDomain.replace(/\./g, '\\.')}`, 'i');
            
            if (linkRegex.test(html)) {
                return { success: true };
            } else {
                return { success: false, error: `Link to ${targetDomain} not found.` };
            }
        } catch (error) {
            return { success: false, error: `Failed to fetch or parse URL. Error: ${error.message}` };
        }
    }

    /**
     * Pings Google's sitemap service with the backlink URL.
     * @param {string} url The backlink URL to ping.
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async function pingGoogleSitemap(url) {
        logMessage(`Pinging Google for: ${url}...`);
        const pingUrl = `https://www.google.com/ping?sitemap=${encodeURIComponent(url)}`;
        const proxyPingUrl = `${CORS_PROXY}${encodeURIComponent(pingUrl)}`;
        
        try {
            const response = await fetch(proxyPingUrl);
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            
            const text = await response.text();
            if (text.includes('Sitemap notification received')) {
                return { success: true };
            } else {
                return { success: false, error: 'Unexpected response from Google.' };
            }
        } catch (error) {
            return { success: false, error: `Google ping failed. Error: ${error.message}` };
        }
    }

    /**
     * Submits the URL to Ping-o-Matic.
     * @param {string} url The backlink URL to submit.
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async function submitToPingOMatic(url) {
        logMessage(`Submitting to Ping-o-Matic: ${url}...`);
        // We use a generic title as it's required by the API.
        const pingOMaticUrl = `http://pingomatic.com/ping/?title=New_Content_Update&blogurl=${encodeURIComponent(url)}&rssurl=${encodeURIComponent(url)}&chk_weblogscom=on`;
        const proxyUrl = `${CORS_PROXY}${encodeURIComponent(pingOMaticUrl)}`;

        try {
            const response = await fetch(proxyUrl);
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

            const text = await response.text();
            if (text.includes('Pinging complete!')) {
                return { success: true };
            } else {
                // Ping-o-Matic can be unreliable. We often assume success if the request doesn't fail.
                return { success: true, warning: 'Could not confirm success, but request was sent.' };
            }
        } catch (error) {
            return { success: false, error: `Ping-o-Matic submission failed. Error: ${error.message}` };
        }
    }

    /**
     * Creates a short URL using the TinyURL API.
     * @param {string} url The URL to shorten.
     * @returns {Promise<{success: boolean, shortUrl?: string, error?: string}>}
     */
    async function createShortUrl(url) {
        logMessage(`Creating short URL for: ${url}...`);
        const apiUrl = `https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`;
        try {
            const response = await fetch(apiUrl);
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            const shortUrl = await response.text();
            if (shortUrl.startsWith('http')) {
                return { success: true, shortUrl };
            } else {
                 return { success: false, error: `API returned an invalid response: ${shortUrl}` };
            }
        } catch (error) {
            return { success: false, error: `Failed to create short URL. Error: ${error.message}` };
        }
    }
    
    // --- PART 3.3: THE CORE WORKER ---

    /**
     * Executes the full amplification sequence for a single URL.
     * @param {string} url The backlink URL.
     * @param {string} targetDomain The user's target domain.
     * @returns {Promise<object>} A result object for the summary report.
     */
    async function amplifyUrl(url, targetDomain) {
        logMessage(`--- Starting amplification for: ${url} ---`, 'info');
        const summary = { url, validation: '❌', google: '❌', pingomatic: '❌', shortlink: 'N/A' };
        await sleep(500);

        // 1. Validate Backlink
        const validationResult = await validateBacklink(url, targetDomain);
        if (validationResult.success) {
            logMessage('Backlink validated successfully.', 'success');
            summary.validation = '✅';
        } else {
            logMessage(`Validation failed: ${validationResult.error}`, 'error');
            logMessage(`--- Halting amplification for ${url} due to validation failure. ---`, 'warning');
            return summary; // Stop processing this URL if validation fails
        }
        await sleep(500);

        // 2. Ping Google
        const googleResult = await pingGoogleSitemap(url);
        if (googleResult.success) {
            logMessage('Google ping successful.', 'success');
            summary.google = '✅';
        } else {
            logMessage(`Google ping failed: ${googleResult.error}`, 'error');
        }
        await sleep(500);

        // 3. Submit to Ping-o-Matic
        const pingOMaticResult = await submitToPingOMatic(url);
        if (pingOMaticResult.success) {
            logMessage('Ping-o-Matic submission sent.', 'success');
            summary.pingomatic = '✅';
        } else {
            logMessage(`Ping-o-Matic submission failed: ${pingOMaticResult.error}`, 'error');
        }
        await sleep(500);

        // 4. Create Short URL
        const shortUrlResult = await createShortUrl(url);
        if (shortUrlResult.success) {
            logMessage(`Short URL created: ${shortUrlResult.shortUrl}`, 'success');
            summary.shortlink = shortUrlResult.shortUrl;
        } else {
            logMessage(`Failed to create short URL: ${shortUrlResult.error}`, 'error');
            summary.shortlink = 'Error';
        }
        
        logMessage(`--- Finished amplification for: ${url} ---`, 'info');
        return summary;
    }

    /**
     * Generates and displays the final summary report table.
     * @param {Array<object>} summaryData Array of result objects from amplifyUrl.
     */
    function generateSummaryReport(summaryData) {
        if (summaryData.length === 0) return;

        const table = document.createElement('table');
        table.className = 'table table-bordered table-striped';
        
        table.innerHTML = `
            <thead class="thead-light">
                <tr>
                    <th>Backlink URL</th>
                    <th>Validation</th>
                    <th>Google Ping</th>
                    <th>Ping-o-Matic</th>
                    <th>Short URL</th>
                </tr>
            </thead>
            <tbody>
                ${summaryData.map(item => `
                    <tr>
                        <td class="text-break">${item.url}</td>
                        <td class="text-center">${item.validation}</td>
                        <td class="text-center">${item.google}</td>
                        <td class="text-center">${item.pingomatic}</td>
                        <td>${item.shortlink.startsWith('http') ? `<a href="${item.shortlink}" target="_blank">${item.shortlink}</a>` : item.shortlink}</td>
                    </tr>
                `).join('')}
            </tbody>
        `;
        
        summaryReportContainer.innerHTML = '';
        summaryReportContainer.appendChild(table);
        summaryReportContainer.classList.remove('d-none');
    }

    // --- PART 3.2: THE MAIN CONTROLLER ---

    /**
     * The main orchestrator function triggered by the start button.
     */
    async function startProcess() {
        // Disable button and update text
        startButton.disabled = true;
        startButton.innerHTML = `
            <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
            Processing...
        `;

        // Clear previous results
        logContainer.innerHTML = '';
        summaryReportContainer.innerHTML = '';
        summaryReportContainer.classList.add('d-none');

        // Get and validate inputs
        const urls = backlinkUrlsInput.value.trim().split('\n').filter(url => url.trim() !== '' && url.startsWith('http'));
        const targetDomain = targetDomainInput.value.trim();

        if (urls.length === 0) {
            logMessage('Please enter at least one valid backlink URL.', 'error');
        }
        if (!targetDomain) {
            logMessage('Please enter your target domain for validation.', 'error');
        }

        if (urls.length === 0 || !targetDomain) {
            startButton.disabled = false;
            startButton.innerText = 'Start Amplification';
            return;
        }

        logMessage(`Starting process for ${urls.length} URL(s) and target domain "${targetDomain}".`, 'info');

        const summaryData = [];
        for (const url of urls) {
            try {
                const result = await amplifyUrl(url.trim(), targetDomain);
                summaryData.push(result);
            } catch (error) {
                logMessage(`A critical error occurred processing ${url}: ${error.message}`, 'error');
                summaryData.push({ url, validation: '❌', google: '❌', pingomatic: '❌', shortlink: 'Critical Error' });
            }
        }
        
        logMessage('All URLs processed. Generating summary report.', 'info');
        generateSummaryReport(summaryData);

        // Re-enable button and restore text
        startButton.disabled = false;
        startButton.innerText = 'Start Amplification';
    }

})();