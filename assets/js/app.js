/* app.js v7.1 - The Non-Blocking Protocol with Advanced Link Analysis & CSV Export */
(() => {
// --- CACHE DOM ELEMENTS ---
const campaignListContainer = document.getElementById('campaignList');
const newCampaignBtn = document.getElementById('newCampaignBtn');
const configPanel = document.getElementById('config-panel');
const configPlaceholder = document.getElementById('config-placeholder');
const startButton = document.getElementById('startButton');
const monitorButton = document.getElementById('monitorButton');
const cleanUrlsBtn = document.getElementById('cleanUrlsBtn');
const exportCsvBtn = document.getElementById('exportCsvBtn');
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
const googleAuthBtn = document.getElementById('googleAuthBtn');
const googleSignOutBtn = document.getElementById('googleSignOutBtn');
const googleAuthStatus = document.getElementById('googleAuthStatus');
const googleSignOutStatus = document.getElementById('googleSignOutStatus');
const googleUserEmail = document.getElementById('googleUserEmail');

// --- STATE MANAGEMENT ---
let campaigns = {};
let activeCampaignId = null;
let settings = { 
    operationMode: 'standard' 
};
let googleTokenClient;
let googleAccessToken = null;

// --- CONFIGURATION ---
const GOOGLE_CLIENT_ID = '229845739113-s91ticoetj6krrj6s8gvjtijgpe6q03r.apps.googleusercontent.com';
const CLOUD_CORS_PROXY = 'https://throbbing-dew-da3c.amr-omar304.workers.dev/?url=';
const LOCAL_STORAGE_KEY_CAMPAIGNS = 'amplifier_campaigns_v6';
const LOCAL_STORAGE_KEY_SETTINGS = 'amplifier_settings_v6';

// --- INITIALIZATION ---
function init() {
    loadSettings();
    loadCampaigns();
    renderCampaignList();
    setupEventListeners();
    
    // **IMPROVEMENT**: Check if the google object is available before initializing
    if (window.google) {
        initializeGoogleClient();
    } else {
        console.error("Google Identity Services script not loaded. Auth button will be disabled.");
        googleAuthBtn.disabled = true;
        const authStatusP = document.querySelector('#googleAuthStatus p');
        if(authStatusP) authStatusP.textContent = "Could not load Google authentication service. Please check your internet connection and refresh the page.";
    }
}

function setupEventListeners() {
    newCampaignBtn.addEventListener('click', createNewCampaign);
    campaignListContainer.addEventListener('click', handleCampaignActions);
    startButton.addEventListener('click', () => startAmplificationProcess());
    monitorButton.addEventListener('click', () => startMonitoringProcess());
    cleanUrlsBtn.addEventListener('click', cleanAndDecodeUrls);
    saveSettingsBtn.addEventListener('click', saveAndApplySettings);
    exportCsvBtn.addEventListener('click', exportCampaignToCSV);
    targetDomainInput.addEventListener('change', () => {
         if (activeCampaignId) {
            campaigns[activeCampaignId].targetDomain = targetDomainInput.value.trim();
            saveCampaigns();
        }
    });
    googleAuthBtn.addEventListener('click', handleGoogleAuth);
    googleSignOutBtn.addEventListener('click', handleGoogleSignOut);
}

// --- CORE OAuth & GIS LOGIC ---
function initializeGoogleClient() {
    try {
        googleTokenClient = google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: 'https://www.googleapis.com/auth/indexing email',
            callback: handleGoogleCredentialResponse,
        });
    } catch (error) {
        console.error("Failed to initialize Google Token Client:", error);
        googleAuthBtn.disabled = true;
    }
}

function handleGoogleAuth() {
    if (googleTokenClient) {
        googleTokenClient.requestAccessToken();
    } else {
        showToast("Google client is not initialized.", "danger");
    }
}

function handleGoogleSignOut() {
    googleAccessToken = null;
    googleAuthStatus.style.display = 'block';
    googleSignOutStatus.style.display = 'none';
    moduleSwitches.googlePing.disabled = true;
    moduleSwitches.googlePing.checked = false;
    showToast('Disconnected from Google.', 'info');
}

function handleGoogleCredentialResponse(response) {
    if (response.error) {
        logMessage(`Google Auth Error: ${response.error}`, 'error');
        showToast('Google authentication failed.', 'danger');
        return;
    }
    googleAccessToken = response.access_token;
    fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { 'Authorization': `Bearer ${googleAccessToken}` }
    })
    .then(res => res.json())
    .then(data => {
        googleUserEmail.textContent = data.email;
        googleAuthStatus.style.display = 'none';
        googleSignOutStatus.style.display = 'block';
        moduleSwitches.googlePing.disabled = false;
        showToast('Successfully connected to Google.', 'success');
    })
    .catch(err => {
        console.error("Failed to fetch user info:", err);
        showToast('Could not verify Google connection.', 'danger');
    });
}


// --- LEGACY SETTINGS (Kept for Modal functionality) ---
function loadSettings() {
    const savedSettings = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY_SETTINGS));
    if (savedSettings) {
        settings = savedSettings;
    }
}

function saveAndApplySettings() {
    bootstrap.Modal.getInstance(document.getElementById('settingsModal')).hide();
    showToast('Settings saved.', 'success');
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
                exportCsvBtn.style.display = 'none';
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
    exportCsvBtn.style.display = 'none';
    if (!activeCampaignId) { summaryReportContainer.innerHTML = ''; return; }
    
    if (linksData.length === 0) { 
        summaryReportContainer.innerHTML = '<div class="alert alert-info">No backlinks in this campaign yet.</div>'; 
        return; 
    }

    exportCsvBtn.style.display = 'block';
    const table = document.createElement('table');
    table.className = 'table table-bordered table-striped table-hover';
    table.innerHTML = `<thead class="thead-light"><tr><th>Backlink URL</th><th>Status</th><th>Validation</th><th>Link Type</th><th>Anchor Text</th><th>Google Status</th><th>Short URL</th></tr></thead><tbody>${linksData.map(item => {
        let displayUrl = item.url; try { displayUrl = decodeURIComponent(item.url); } catch (e) {}
        const truncatedUrl = displayUrl.length > 50 ? `${displayUrl.substring(0, 47)}...` : displayUrl;
        const statusClass = item.live ? 'text-success' : 'text-danger';
        const statusText = item.live === undefined ? 'Unknown' : (item.live ? 'Live' : 'Dead');

        let linkTypeBadge = '⚪';
        if (item.linkType === 'Dofollow') {
            linkTypeBadge = '<span class="badge bg-success">Dofollow</span>';
        } else if (item.linkType === 'Nofollow') {
            linkTypeBadge = '<span class="badge bg-warning text-dark">Nofollow</span>';
        }

        const truncatedAnchor = (item.anchorText || 'N/A').length > 30 ? `${(item.anchorText).substring(0, 27)}...` : (item.anchorText || 'N/A');
        
        return `<tr>
                    <td class="text-break" title="Page Title: ${item.pageTitle || 'N/A'}">${truncatedUrl}</td>
                    <td class="text-center fw-bold ${statusClass}">${statusText}</td>
                    <td class="text-center">${item.validation || '⚪'}</td>
                    <td class="text-center">${linkTypeBadge}</td>
                    <td title="${item.anchorText || 'N/A'}">${truncatedAnchor}</td>
                    <td class="text-center">${item.google || '⚪'}</td> 
                    <td>${item.shortlink && item.shortlink.startsWith('http') ? `<a href="${item.shortlink}" target="_blank" rel="noopener noreferrer">${item.shortlink}</a>` : (item.shortlink || '⚪')}</td>
                </tr>`;
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
        link.pageTitle = validationResult.pageTitle;
        link.anchorText = validationResult.anchorText;
        link.linkType = validationResult.linkType;
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
    const summary = { url, validation: '⚪', google: '⚪', pingomatic: '⚪', shortlink: '⚪', live: undefined, pageTitle: '⚪', anchorText: '⚪', linkType: '⚪', lastAmplified: new Date().toISOString() };
    await sleep(500);
    if (activeModules.validate) {
        const result = await validateBacklink(url, targetDomain);
        summary.live = result.success;
        summary.validation = result.success ? '✅' : '❌';
        summary.pageTitle = result.pageTitle;
        summary.anchorText = result.anchorText;
        summary.linkType = result.linkType;
        logMessage(result.success ? 'Backlink validated successfully.' : `Validation failed: ${result.error}`, result.success ? 'success' : 'error');
        if (!result.success) { logMessage(`--- Halting signals for ${url} due to validation failure. ---`, 'warning'); return summary; }
        await sleep(500);
    }
    if (activeModules.googlePing) {
        const result = await submitToGoogleIndexingAPI(url);
        summary.google = result.success ? '✅' : '❌';
        logMessage(result.success ? 'Google submission accepted.' : `Google submission failed: ${result.error}`, result.success ? 'success' : 'error');
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
    const proxyUrl = CLOUD_CORS_PROXY + encodeURIComponent(url);
    try {
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const html = await response.text();

        const titleMatch = html.match(/<title>(.*?)<\/title>/i);
        const pageTitle = titleMatch ? titleMatch[1].trim() : 'No Title Found';

        const linkRegex = new RegExp(`href\\s*=\\s*["'](https?:\\/\\/)?(www\\.)?${targetDomain.replace(/\./g, '\\.')}`, 'i');
        if (!linkRegex.test(html)) {
            return { success: false, error: `Link to ${targetDomain} not found.`, pageTitle: 'N/A', anchorText: 'N/A', linkType: 'N/A' };
        }

        const linkElementRegex = new RegExp(`<a[^>]*href\\s*=\\s*["'][^"']*${targetDomain.replace(/\./g, '\\.')}[^"']*["'][^>]*>.*?<\\/a>`, 'i');
        const linkElementMatch = html.match(linkElementRegex);

        if (linkElementMatch) {
            const fullTag = linkElementMatch[0];
            const anchorTextContent = fullTag.replace(/<[^>]+>/g, '').trim();
            const anchorText = anchorTextContent === '' ? '(Empty Anchor)' : anchorTextContent;
            const isNofollow = /rel\s*=\s*["']?[^>]*nofollow/i.test(fullTag);
            const linkType = isNofollow ? 'Nofollow' : 'Dofollow';
            return { success: true, error: null, pageTitle, anchorText, linkType };
        }
        
        return { success: true, error: null, pageTitle, anchorText: 'N/A', linkType: 'N/A' };

    } catch (error) {
        return { success: false, error: `Failed to fetch. ${error.message}`, pageTitle: 'N/A', anchorText: 'N/A', linkType: 'N/A' };
    }
}

async function submitToGoogleIndexingAPI(url) {
    logMessage(`Submitting to Google Indexing API: ${url}...`);
    if (!googleAccessToken) {
        return { success: false, error: 'User is not authenticated with Google.' };
    }

    const endpoint = 'https://indexing.googleapis.com/v3/urlNotifications:publish';
    
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${googleAccessToken}`
            },
            body: JSON.stringify({
                url: url,
                type: 'URL_UPDATED'
            })
        });

        const data = await response.json();

        if (!response.ok) {
            const errorMsg = data.error?.message || `HTTP error! Status: ${response.status}`;
            throw new Error(errorMsg);
        }
        
        return { success: true, data: data };

    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function submitToPingOMatic(url) {
    logMessage(`Submitting to Ping-o-Matic: ${url}...`);
    const pingOMaticUrl = `http://pingomatic.com/ping/?title=New_Content_Update&blogurl=${encodeURIComponent(url)}&rssurl=${encodeURIComponent(url)}&chk_weblogscom=on`;
    const proxyUrl = CLOUD_CORS_PROXY + encodeURIComponent(pingOMaticUrl);
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

function exportCampaignToCSV() {
    const campaign = campaigns[activeCampaignId];
    if (!campaign || campaign.links.length === 0) {
        showToast('No data available to export.', 'warning');
        return;
    }

    const sanitizeCell = (cellData) => {
        if (cellData == null) return '';
        let str = String(cellData);
        str = str.replace(/"/g, '""'); 
        if (str.includes(',') || str.includes('\n') || str.includes('"')) {
            str = `"${str}"`;
        }
        return str;
    };

    const headers = [
        "Backlink URL", "Status", "Validation", "Link Type", "Anchor Text", 
        "Page Title", "Google Status", "Short URL", "Last Checked"
    ];
    
    const rows = campaign.links.map(link => [
        sanitizeCell(link.url),
        sanitizeCell(link.live === undefined ? 'Unknown' : (link.live ? 'Live' : 'Dead')),
        sanitizeCell(link.validation),
        sanitizeCell(link.linkType),
        sanitizeCell(link.anchorText),
        sanitizeCell(link.pageTitle),
        sanitizeCell(link.google),
        sanitizeCell(link.shortlink),
        sanitizeCell(link.lastChecked ? new Date(link.lastChecked).toLocaleString() : 'N/A')
    ].join(','));
    
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    
    const campaignName = campaign.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const date = new Date().toISOString().split('T')[0];
    const filename = `${campaignName}_report_${date}.csv`;
    
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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

// Call the main initialization function.
// With the 'defer' attribute on the script tag, the DOM will be ready.
init();
})();
