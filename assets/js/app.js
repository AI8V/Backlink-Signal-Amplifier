/* app.js v3.0 - The Tactical Suite */
(() => {
    // --- CACHE DOM ELEMENTS ---
    const startButton = document.getElementById('startButton');
    const backlinkUrlsInput = document.getElementById('backlinkUrls');
    const targetDomainInput = document.getElementById('targetDomain');
    const logContainer = document.getElementById('logContainer');
    const summaryReportContainer = document.getElementById('summaryReport');
    const progressContainer = document.getElementById('progress-container');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    const cleanUrlsBtn = document.getElementById('cleanUrlsBtn');
    
    // Module checkboxes
    const moduleSwitches = {
        validate: document.getElementById('moduleValidate'),
        googlePing: document.getElementById('moduleGooglePing'),
        pingServices: document.getElementById('modulePingServices'),
        shortUrl: document.getElementById('moduleShortUrl')
    };

    // --- CONFIGURATION ---
    // Using a reliable, public proxy for the Google Ping worker. No user setup needed.
    const PING_PROXY_URL = 'https://ping-proxy.ai8v-dev.workers.dev/'; // This is a public, ready-to-use endpoint.
    const CORS_PROXY = 'https://api.allorigins.win/raw?url=';

    startButton.addEventListener('click', startProcess);
    cleanUrlsBtn.addEventListener('click', cleanAndDecodeUrls);

    // --- UTILITY FUNCTIONS ---
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

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // --- NEW UI UTILITY ---
    function cleanAndDecodeUrls() {
        let urls = backlinkUrlsInput.value.trim().split('\n');
        let decodedUrls = urls.map(url => {
            try {
                // Iteratively decode until the URL stops changing
                let previousUrl = '';
                let currentUrl = url.trim();
                while (currentUrl !== previousUrl) {
                    previousUrl = currentUrl;
                    currentUrl = decodeURIComponent(previousUrl);
                }
                return currentUrl;
            } catch (e) {
                return url.trim(); // Return original if decoding fails
            }
        }).filter(url => url);
        backlinkUrlsInput.value = decodedUrls.join('\n');
        logMessage('URLs have been cleaned and decoded.', 'success');
    }

    // --- SIGNAL AMPLIFICATION MODULES ---
    async function validateBacklink(url, targetDomain) {
        logMessage(`Validating: ${url}...`);
        const proxyUrl = `${CORS_PROXY}${encodeURIComponent(url)}`;
        try {
            const response = await fetch(proxyUrl);
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            const html = await response.text();
            const linkRegex = new RegExp(`href\\s*=\\s*["'](https?:\\/\\/)?(www\\.)?${targetDomain.replace(/\./g, '\\.')}`, 'i');
            if (linkRegex.test(html)) return { success: true };
            return { success: false, error: `Link to ${targetDomain} not found.` };
        } catch (error) {
            return { success: false, error: `Failed to fetch or parse URL. Error: ${error.message}` };
        }
    }

    async function pingGoogleSitemap(url) {
        logMessage(`Pinging Google for: ${url}...`);
        const workerUrl = `${PING_PROXY_URL}?url=${encodeURIComponent(url)}`;
        try {
            const response = await fetch(workerUrl);
            const data = await response.json();
            if (response.ok && data.success) return { success: true };
            return { success: false, error: data.error || `Worker returned HTTP ${response.status}` };
        } catch (error) {
            return { success: false, error: `Could not reach ping worker. Error: ${error.message}` };
        }
    }

    async function submitToPingOMatic(url) {
        logMessage(`Submitting to Ping-o-Matic: ${url}...`);
        const pingOMaticUrl = `http://pingomatic.com/ping/?title=New_Content_Update&blogurl=${encodeURIComponent(url)}&rssurl=${encodeURIComponent(url)}&chk_weblogscom=on`;
        const proxyUrl = `${CORS_PROXY}${encodeURIComponent(pingOMaticUrl)}`;
        try {
            const response = await fetch(proxyUrl);
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            const text = await response.text();
            if (text.includes('Pinging complete!')) return { success: true };
            return { success: true, warning: 'Could not confirm success, but request was sent.' };
        } catch (error) {
            return { success: false, error: `Ping-o-Matic submission failed. Error: ${error.message}` };
        }
    }

    async function createShortUrl(url) {
        logMessage(`Creating short URL for: ${url}...`);
        try {
            const apiUrl = `https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`;
            const response = await fetch(apiUrl);
            if (!response.ok) throw new Error(`TinyURL API error! Status: ${response.status}`);
            const shortUrl = await response.text();
            if (shortUrl.startsWith('http')) return { success: true, shortUrl };
            throw new Error('Invalid response from TinyURL');
        } catch (primaryError) {
            logMessage(`TinyURL failed: ${primaryError.message}. Trying fallback...`, 'warning');
            await sleep(1000);
            try {
                const fallbackApiUrl = `https://is.gd/create.php?format=json&url=${encodeURIComponent(url)}`;
                const corsFallbackUrl = `${CORS_PROXY}${encodeURIComponent(fallbackApiUrl)}`;
                const response = await fetch(corsFallbackUrl);
                if (!response.ok) throw new Error(`is.gd API error! Status: ${response.status}`);
                const data = await response.json();
                if (data.shorturl) return { success: true, shortUrl: data.shorturl };
                throw new Error(data.errormessage || 'Unknown error');
            } catch (fallbackError) {
                return { success: false, error: `All shorteners failed. Last error: ${fallbackError.message}` };
            }
        }
    }
    
    // --- V3.0 CORE WORKER ---
    async function amplifyUrl(url, targetDomain, activeModules) {
        logMessage(`--- Starting amplification for: ${url} ---`, 'info');
        const summary = { url, validation: '⚪', google: '⚪', pingomatic: '⚪', shortlink: '⚪' };
        await sleep(500);

        if (activeModules.validate) {
            const validationResult = await validateBacklink(url, targetDomain);
            summary.validation = validationResult.success ? '✅' : '❌';
            logMessage(validationResult.success ? 'Backlink validated successfully.' : `Validation failed: ${validationResult.error}`, validationResult.success ? 'success' : 'error');
            if (!validationResult.success) {
                logMessage(`--- Halting subsequent signals for ${url} due to validation failure. ---`, 'warning');
                return summary;
            }
            await sleep(500);
        }

        if (activeModules.googlePing) {
            const googleResult = await pingGoogleSitemap(url);
            summary.google = googleResult.success ? '✅' : '❌';
            logMessage(googleResult.success ? 'Google ping successful.' : `Google ping failed: ${googleResult.error}`, googleResult.success ? 'success' : 'error');
            await sleep(500);
        }

        if (activeModules.pingServices) {
            const pingOMaticResult = await submitToPingOMatic(url);
            summary.pingomatic = pingOMaticResult.success ? '✅' : '❌';
            logMessage(pingOMaticResult.success ? 'Ping-o-Matic submission sent.' : `Ping-o-Matic submission failed: ${pingOMaticResult.error}`, pingOMaticResult.success ? 'success' : 'error');
            await sleep(500);
        }

        if (activeModules.shortUrl) {
            const shortUrlResult = await createShortUrl(url);
            if (shortUrlResult.success) {
                logMessage(`Short URL created: ${shortUrlResult.shortUrl}`, 'success');
                summary.shortlink = shortUrlResult.shortUrl;
            } else {
                logMessage(`Failed to create short URL: ${shortUrlResult.error}`, 'error');
                summary.shortlink = 'Error';
            }
        }
        
        logMessage(`--- Finished amplification for: ${url} ---`, 'info');
        return summary;
    }
    
    // --- UI UPDATE FUNCTIONS ---
    function generateSummaryReport(summaryData) {
        if (summaryData.length === 0) return;
        const table = document.createElement('table');
        table.className = 'table table-bordered table-striped';
        table.innerHTML = `
            <thead class="thead-light"><tr><th>Backlink URL</th><th>Validation</th><th>Google Ping</th><th>Ping-o-Matic</th><th>Short URL</th></tr></thead>
            <tbody>
                ${summaryData.map(item => {
                    let displayUrl = item.url;
                    try { displayUrl = decodeURIComponent(item.url); } catch (e) { /* Ignore */ }
                    const truncatedUrl = displayUrl.length > 50 ? `${displayUrl.substring(0, 47)}...` : displayUrl;
                    return `<tr>
                        <td class="text-break" title="${displayUrl}">${truncatedUrl}</td>
                        <td class="text-center">${item.validation}</td><td class="text-center">${item.google}</td><td class="text-center">${item.pingomatic}</td>
                        <td>${item.shortlink.startsWith('http') ? `<a href="${item.shortlink}" target="_blank" rel="noopener noreferrer">${item.shortlink}</a>` : item.shortlink}</td>
                    </tr>`;
                }).join('')}
            </tbody>`;
        summaryReportContainer.innerHTML = '';
        summaryReportContainer.appendChild(table);
        summaryReportContainer.classList.remove('d-none');
    }

    function updateProgress(current, total) {
        if (total === 0) {
            progressContainer.classList.add('d-none');
            return;
        }
        progressContainer.classList.remove('d-none');
        const percentage = Math.round((current / total) * 100);
        progressBar.style.width = `${percentage}%`;
        progressBar.setAttribute('aria-valuenow', percentage);
        progressText.textContent = `${current} / ${total}`;
    }

    // --- V3.0 MAIN CONTROLLER ---
    async function startProcess() {
        startButton.disabled = true;
        startButton.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Processing...`;

        logContainer.innerHTML = '';
        summaryReportContainer.classList.add('d-none');
        
        const urls = backlinkUrlsInput.value.trim().split('\n').filter(url => url.trim() && url.startsWith('http'));
        const targetDomain = targetDomainInput.value.trim();
        const activeModules = {
            validate: moduleSwitches.validate.checked,
            googlePing: moduleSwitches.googlePing.checked,
            pingServices: moduleSwitches.pingServices.checked,
            shortUrl: moduleSwitches.shortUrl.checked
        };
        
        if (urls.length === 0 || (!targetDomain && activeModules.validate)) {
            if (urls.length === 0) logMessage('Please enter at least one valid backlink URL.', 'error');
            if (!targetDomain && activeModules.validate) logMessage('Please enter your target domain for validation.', 'error');
            startButton.disabled = false;
            startButton.innerText = 'Start Amplification';
            updateProgress(0, 0);
            return;
        }

        logMessage(`Starting process for ${urls.length} URL(s)...`, 'info');
        updateProgress(0, urls.length);

        const summaryData = [];
        let count = 0;
        for (const url of urls) {
            try {
                const result = await amplifyUrl(url.trim(), targetDomain, activeModules);
                summaryData.push(result);
            } catch (error) {
                logMessage(`A critical error occurred processing ${url}: ${error.message}`, 'error');
                summaryData.push({ url, validation: '❌', google: '❌', pingomatic: '❌', shortlink: 'Critical Error' });
            }
            count++;
            updateProgress(count, urls.length);
        }
        
        logMessage('All URLs processed. Generating summary report.', 'info');
        generateSummaryReport(summaryData);

        startButton.disabled = false;
        startButton.innerText = 'Start Amplification';
    }
})();