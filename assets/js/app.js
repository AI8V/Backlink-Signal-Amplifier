/* app.js v6.0 - The Non-Blocking Protocol */
(() => {
    // --- CACHE DOM ELEMENTS ---
    const campaignListContainer = document.getElementById('campaignList');
    const newCampaignBtn = document.getElementById('newCampaignBtn');
    const configPanel = document.getElementById('config-panel');
    const configPlaceholder = document.getElementById('config-placeholder');
    const startButton = document.getElementById('startButton');
    const monitorButton = document.getElementById('monitorButton');
    const cleanUrlsBtn = document.getElementById('cleanUrlsBtn');
    const backlinkUrlsInput = document.getElementById('backlinkUrls');
    const targetDomainInput = document.getElementById('targetDomain');
    const logContainer = document.getElementById('logContainer');
    const summaryReportContainer = document.getElementById('summaryReport');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const progressContainer = document.getElementById('progress-container');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    const moduleSwitches = {
        validate: document.getElementById('moduleValidate'),
        googlePing: document.getElementById('moduleGooglePing'),
        pingServices: document.getElementById('modulePingServices'),
        shortUrl: document.getElementById('moduleShortUrl')
    };

    // --- STATE MANAGEMENT ---
    let campaigns = {};
    let activeCampaignId = null;
    let settings = {
        operationMode: 'standard' // Default to standard mode
    };

    // --- CONFIGURATION ---
    const CLOUD_PING_PROXY = 'https://ping-proxy.ai8v-dev.workers.dev/';
    const CLOUD_CORS_PROXY = 'https://api.allorigins.win/raw?url=';
    const LOCAL_STORAGE_KEY_CAMPAIGNS = 'amplifier_campaigns_v6';
    const LOCAL_STORAGE_KEY_SETTINGS = 'amplifier_settings_v6';

    // --- INITIALIZATION ---
    function init() {
        loadSettings();
        loadCampaigns();
        renderCampaignList();
        setupEventListeners();
    }

    function setupEventListeners() {
        newCampaignBtn.addEventListener('click', createNewCampaign);
        campaignListContainer.addEventListener('click', handleCampaignActions);
        startButton.addEventListener('click', () => startAmplificationProcess());
        monitorButton.addEventListener('click', () => startMonitoringProcess());
        cleanUrlsBtn.addEventListener('click', cleanAndDecodeUrls);
        saveSettingsBtn.addEventListener('click', saveAndApplySettings);
        targetDomainInput.addEventListener('change', () => {
             if (activeCampaignId) {
                campaigns[activeCampaignId].targetDomain = targetDomainInput.value.trim();
                saveCampaigns();
            }
        });
    }

    // --- SETTINGS (Privacy Switch) ---
    function loadSettings() {
        const savedSettings = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY_SETTINGS));
        if (savedSettings && (savedSettings.operationMode === 'standard' || savedSettings.operationMode === 'privacy')) {
            settings = savedSettings;
        }
        document.querySelector(`input[name="operationMode"][value="${settings.operationMode}"]`).checked = true;
    }

    function saveAndApplySettings() {
        const selectedMode = document.querySelector('input[name="operationMode"]:checked').value;
        settings.operationMode = selectedMode;
        localStorage.setItem(LOCAL_STORAGE_KEY_SETTINGS, JSON.stringify(settings));
        showToast(`Settings saved. Mode: ${selectedMode}`, 'success');
        bootstrap.Modal.getInstance(document.getElementById('settingsModal')).hide();
    }

    function getProxy(endpoint) {
        if (settings.operationMode === 'privacy') {
            return CLOUD_CORS_PROXY;
        } else {
            return endpoint === 'ping' ? CLOUD_PING_PROXY : CLOUD_CORS_PROXY;
        }
    }
    
    // --- CAMPAIGN MANAGEMENT ---
    function loadCampaigns() {
        campaigns = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY_CAMPAIGNS)) || {};
    }

    function saveCampaigns() {
        localStorage.setItem(LOCAL_STORAGE_KEY_CAMPAIGNS, JSON.stringify(campaigns));
    }

    function createNewCampaign() {
        const campaignName = prompt("Enter a name for the new campaign:");
        if (campaignName && campaignName.trim()) {
            const id = `campaign_${Date.now()}`;
            campaigns[id] = { id, name: campaignName.trim(), targetDomain: '', links: [], createdAt: new Date().toISOString() };
            saveCampaigns();
            renderCampaignList();
            selectCampaign(id);
        }
    }

    async function handleCampaignActions(e) {
        const target = e.target.closest('[data-action]');
        if (!target) return;
        const action = target.dataset.action;
        const id = target.dataset.id;
        if (action === 'select') {
            selectCampaign(id);
        } else if (action === 'delete') {
            if (await showConfirm(`Are you sure you want to delete the campaign "${campaigns[id].name}"?`)) {
                delete campaigns[id];
                saveCampaigns();
                if(activeCampaignId === id) {
                    activeCampaignId = null;
                    configPanel.style.display = 'none';
                    configPlaceholder.style.display = 'block';
                    summaryReportContainer.innerHTML = '';
                }
                renderCampaignList();
                showToast("Campaign deleted.", "danger");
            }
        }
    }
    
    function selectCampaign(id) {
        activeCampaignId = id;
        loadCampaignIntoUI(id);
        renderCampaignList();
    }
    
    function loadCampaignIntoUI(campaignId) {
        const campaign = campaigns[campaignId];
        if (!campaign) return;
        targetDomainInput.value = campaign.targetDomain;
        backlinkUrlsInput.value = '';
        configPanel.style.display = 'block';
        configPlaceholder.style.display = 'none';
        generateSummaryReport(campaign.links, campaign.targetDomain);
    }
    
    // --- UI RENDERING ---
    function renderCampaignList() {
        campaignListContainer.innerHTML = '';
        const ids = Object.keys(campaigns);
        if (ids.length === 0) {
            campaignListContainer.innerHTML = '<li class="list-group-item">No campaigns found. Create one to begin!</li>';
            return;
        }
        ids.forEach(id => {
            const campaign = campaigns[id];
            const item = document.createElement('li');
            item.className = `list-group-item list-group-item-action d-flex justify-content-between align-items-center ${id === activeCampaignId ? 'active' : ''}`;
            item.innerHTML = `<div><strong class="mb-1">${campaign.name}</strong><small class="d-block">${campaign.links.length} links | Target: ${campaign.targetDomain || 'Not set'}</small></div><div><button class="btn btn-sm btn-outline-primary me-2" data-action="select" data-id="${id}"><i class="bi bi-cursor-fill"></i> Select</button><button class="btn btn-sm btn-danger" data-action="delete" data-id="${id}"><i class="bi bi-trash-fill"></i></button></div>`;
            campaignListContainer.appendChild(item);
        });
    }

    function generateSummaryReport(linksData = [], targetDomain = '') {
        if (!activeCampaignId) { summaryReportContainer.innerHTML = ''; return; }
        if (linksData.length === 0) { summaryReportContainer.innerHTML = '<div class="alert alert-info">No backlinks in this campaign yet.</div>'; return; }
        const table = document.createElement('table');
        table.className = 'table table-bordered table-striped table-hover';
        table.innerHTML = `<thead class="thead-light"><tr><th>Backlink URL</th><th>Status</th><th>Validation</th><th>Google Ping</th><th>Ping-o-Matic</th><th>Short URL</th></tr></thead><tbody>${linksData.map(item => {
            let displayUrl = item.url; try { displayUrl = decodeURIComponent(item.url); } catch (e) {}
            const truncatedUrl = displayUrl.length > 50 ? `${displayUrl.substring(0, 47)}...` : displayUrl;
            const statusClass = item.live ? 'text-success' : 'text-danger';
            const statusText = item.live === undefined ? 'Unknown' : (item.live ? 'Live' : 'Dead');
            return `<tr><td class="text-break" title="${displayUrl}">${truncatedUrl}</td><td class="text-center fw-bold ${statusClass}">${statusText}</td><td class="text-center">${item.validation || '⚪'}</td><td class="text-center">${item.google || '⚪'}</td><td class="text-center">${item.pingomatic || '⚪'}</td><td>${item.shortlink && item.shortlink.startsWith('http') ? `<a href="${item.shortlink}" target="_blank" rel="noopener noreferrer">${item.shortlink}</a>` : (item.shortlink || '⚪')}</td></tr>`;
        }).join('')}</tbody>`;
        summaryReportContainer.innerHTML = '';
        summaryReportContainer.appendChild(table);
    }
    
    // --- CORE PROCESSES ---
    async function startAmplificationProcess() {
        if (!activeCampaignId) { showToast('Please select or create a campaign first.', 'warning'); return; }
        setControlsState(true);
        logContainer.innerHTML = '';
        const newUrls = backlinkUrlsInput.value.trim().split('\n').filter(url => url.trim() && url.startsWith('http'));
        const campaign = campaigns[activeCampaignId];
        const targetDomain = campaign.targetDomain;
        const activeModules = getActiveModules();
        if (newUrls.length === 0) { logMessage('No new URLs to process.', 'warning'); setControlsState(false); return; }
        if (!targetDomain && activeModules.validate) { logMessage('Target domain is required for validation.', 'error'); setControlsState(false); return; }
        logMessage(`Starting amplification for ${newUrls.length} new URL(s)...`, 'info');
        updateProgress(0, newUrls.length);
        for (const [index, url] of newUrls.entries()) {
            if (campaign.links.find(l => l.url === url)) { logMessage(`URL already in campaign, skipping: ${url}`, 'warning'); continue; }
            const result = await amplifyUrl(url.trim(), targetDomain, activeModules);
            campaign.links.push(result);
            updateProgress(index + 1, newUrls.length);
        }
        saveCampaigns();
        loadCampaignIntoUI(activeCampaignId);
        logMessage('All new URLs processed.', 'success');
        setControlsState(false);
    }
    
    async function startMonitoringProcess() {
        if (!activeCampaignId) { showToast('Please select or create a campaign first.', 'warning'); return; }
        setControlsState(true);
        logContainer.innerHTML = '';
        const campaign = campaigns[activeCampaignId];
        if (campaign.links.length === 0) { logMessage('No links in this campaign to monitor.', 'warning'); setControlsState(false); return; }
        logMessage(`Starting monitoring for ${campaign.links.length} existing link(s)...`, 'info');
        updateProgress(0, campaign.links.length);
        for (const [index, link] of campaign.links.entries()) {
            logMessage(`--- Checking status of: ${link.url} ---`, 'info');
            const validationResult = await validateBacklink(link.url, campaign.targetDomain);
            link.live = validationResult.success;
            link.lastChecked = new Date().toISOString();
            logMessage(`Link is ${link.live ? 'Live' : 'Dead'}.`, link.live ? 'success' : 'error');
            updateProgress(index + 1, campaign.links.length);
            await sleep(500);
        }
        saveCampaigns();
        loadCampaignIntoUI(activeCampaignId);
        logMessage('Monitoring complete.', 'success');
        setControlsState(false);
    }

    // --- WORKER & UTILITY FUNCTIONS ---
    async function amplifyUrl(url, targetDomain, activeModules) {
        logMessage(`--- Starting amplification for: ${url} ---`, 'info');
        const summary = { url, validation: '⚪', google: '⚪', pingomatic: '⚪', shortlink: '⚪', live: undefined, lastAmplified: new Date().toISOString() };
        await sleep(500);
        if (activeModules.validate) {
            const result = await validateBacklink(url, targetDomain);
            summary.live = result.success;
            summary.validation = result.success ? '✅' : '❌';
            logMessage(result.success ? 'Backlink validated successfully.' : `Validation failed: ${result.error}`, result.success ? 'success' : 'error');
            if (!result.success) { logMessage(`--- Halting signals for ${url} due to validation failure. ---`, 'warning'); return summary; }
            await sleep(500);
        }
        if (activeModules.googlePing) {
            const result = await pingGoogleSitemap(url);
            summary.google = result.success ? '✅' : '❌';
            logMessage(result.success ? 'Google ping successful.' : `Google ping failed: ${result.error}`, result.success ? 'success' : 'error');
            await sleep(500);
        }
        if (activeModules.pingServices) {
            const result = await submitToPingOMatic(url);
            summary.pingomatic = result.success ? '✅' : '❌';
            logMessage(result.success ? 'Ping-o-Matic submission sent.' : `Ping-o-Matic failed: ${result.error}`, result.success ? 'success' : 'error');
            await sleep(500);
        }
        if (activeModules.shortUrl) {
            const result = await createShortUrl(url);
            summary.shortlink = result.success ? result.shortUrl : 'Error';
            logMessage(result.success ? `Short URL created: ${result.shortUrl}` : `Failed to create short URL: ${result.error}`, result.success ? 'success' : 'error');
        }
        logMessage(`--- Finished amplification for: ${url} ---`, 'info');
        return summary;
    }

    async function validateBacklink(url, targetDomain) {
        logMessage(`Validating: ${url}...`);
        const proxyUrl = getProxy('cors') + encodeURIComponent(url);
        try {
            const response = await fetch(proxyUrl);
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            const html = await response.text();
            const linkRegex = new RegExp(`href\\s*=\\s*["'](https?:\\/\\/)?(www\\.)?${targetDomain.replace(/\./g, '\\.')}`, 'i');
            return { success: linkRegex.test(html), error: linkRegex.test(html) ? null : `Link to ${targetDomain} not found.` };
        } catch (error) {
            return { success: false, error: `Failed to fetch. ${error.message}` };
        }
    }

    async function pingGoogleSitemap(url) {
        logMessage(`Pinging Google for: ${url}...`);
        if (settings.operationMode === 'privacy') {
            return { success: false, error: 'Google Ping is unavailable in Enhanced Privacy Mode.' };
        }
        const pingUrl = getProxy('ping') + `?url=${encodeURIComponent(url)}`;
        try {
            const response = await fetch(pingUrl);
            const data = await response.json();
            return { success: response.ok && data.success, error: data.error || `Ping worker returned HTTP ${response.status}` };
        } catch (error) {
            return { success: false, error: `Could not reach ping worker. Error: ${error.message}` };
        }
    }
    
    async function submitToPingOMatic(url) {
        logMessage(`Submitting to Ping-o-Matic: ${url}...`);
        const pingOMaticUrl = `http://pingomatic.com/ping/?title=New_Content_Update&blogurl=${encodeURIComponent(url)}&rssurl=${encodeURIComponent(url)}&chk_weblogscom=on`;
        const proxyUrl = getProxy('cors') + encodeURIComponent(pingOMaticUrl);
        try {
            const response = await fetch(proxyUrl);
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            return { success: true };
        } catch (error) {
            return { success: false, error: `Submission failed. ${error.message}` };
        }
    }

    async function createShortUrl(url) {
        logMessage(`Creating short URL for: ${url}...`);
        try {
            const apiUrl = `https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`;
            const response = await fetch(apiUrl);
            if (!response.ok) throw new Error(`API error! Status: ${response.status}`);
            const shortUrl = await response.text();
            if (shortUrl.startsWith('http')) return { success: true, shortUrl };
            throw new Error('Invalid response from TinyURL');
        } catch (error) {
            return { success: false, error: `Shortener failed. ${error.message}` };
        }
    }

    // --- CORE UTILITIES ---
    const { cleanAndDecodeUrls, sleep, logMessage, updateProgress, setControlsState, getActiveModules } = (() => {
        function cleanAndDecodeUrls() {
            let urls = backlinkUrlsInput.value.trim().split('\n');
            let decodedUrls = urls.map(url => {
                try {
                    let previousUrl = '', currentUrl = url.trim();
                    while (currentUrl !== previousUrl) { previousUrl = currentUrl; currentUrl = decodeURIComponent(previousUrl); }
                    return currentUrl;
                } catch (e) { return url.trim(); }
            }).filter(url => url);
            backlinkUrlsInput.value = decodedUrls.join('\n');
            logMessage('URLs have been cleaned and decoded.', 'success');
        }
        function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
        function logMessage(message, status = 'info') {
            const p = document.createElement('p');
            p.className = `log-message status-${status}`;
            p.innerHTML = `${{success:'✅',error:'❌',info:'ℹ️',warning:'⚠️'}[status]||'ℹ️'} ${new Date().toLocaleTimeString()}: ${message}`;
            logContainer.appendChild(p);
            logContainer.scrollTop = logContainer.scrollHeight;
        }
        function updateProgress(current, total) {
            if (total === 0) { progressContainer.classList.add('d-none'); return; }
            progressContainer.classList.remove('d-none');
            const percentage = Math.round((current / total) * 100);
            progressBar.style.width = `${percentage}%`;
            progressBar.setAttribute('aria-valuenow', percentage);
            progressText.textContent = `${current} / ${total}`;
        }
        function setControlsState(isProcessing) {
            startButton.disabled = isProcessing;
            monitorButton.disabled = isProcessing;
            newCampaignBtn.disabled = isProcessing;
            startButton.innerHTML = isProcessing ? `<span class="spinner-border spinner-border-sm"></span> Amplifying...` : `Amplify New Links`;
            monitorButton.innerHTML = isProcessing ? `<span class="spinner-border spinner-border-sm"></span> Monitoring...` : `<i class="bi bi-arrow-repeat me-1"></i> Monitor Existing Links`;
        }
        function getActiveModules() {
            return Object.keys(moduleSwitches).reduce((acc, key) => { acc[key] = moduleSwitches[key].checked; return acc; }, {});
        }
        return { cleanAndDecodeUrls, sleep, logMessage, updateProgress, setControlsState, getActiveModules };
    })();
    
    init();
})();