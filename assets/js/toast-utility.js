// toast-utility.js
'use strict';

/**
 * @file toast-utility.js
 * @description A centralized utility for creating Toasts and promise-based confirmation Modals.
 */

// --- Toast Functionality ---
function showToast(message, type = 'info') {
    const toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) { alert(message); return; } // Fallback

    const toastId = 'toast-' + Date.now();
    let iconHtml, toastClass;

    switch (type) {
        case 'success': iconHtml = '<i class="bi bi-check-circle-fill me-2"></i>'; toastClass = 'bg-success text-white'; break;
        case 'danger':  iconHtml = '<i class="bi bi-x-octagon-fill me-2"></i>'; toastClass = 'bg-danger text-white'; break;
        case 'warning': iconHtml = '<i class="bi bi-exclamation-triangle-fill me-2"></i>'; toastClass = 'bg-warning text-dark'; break;
        default:        iconHtml = '<i class="bi bi-info-circle-fill me-2"></i>'; toastClass = 'bg-info text-dark'; break;
    }

    const toastHtml = `
        <div id="${toastId}" class="toast align-items-center ${toastClass} border-0" role="alert" aria-live="assertive" aria-atomic="true">
        <div class="d-flex align-items-center">
            <div class="toast-body">${iconHtml}${message}</div>
            <button type="button" class="btn-close btn-close-white ms-auto me-2" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
    </div>`;
    toastContainer.insertAdjacentHTML('beforeend', toastHtml);

    const toastElement = document.getElementById(toastId);
    const toast = new bootstrap.Toast(toastElement, { delay: 5000 });
    toastElement.addEventListener('hidden.bs.toast', () => toastElement.remove());
    toast.show();
}

// --- Promise-based Confirmation Modal ---
let confirmModalInstance = null;
let confirmResolve = null;

/**
 * Shows a confirmation modal and returns a Promise that resolves with true or false.
 * @param {string} message - The message to display in the modal body.
 * @returns {Promise<boolean>}
 */
function showConfirm(message) {
    const confirmModalEl = document.getElementById('confirmationModal');
    const confirmModalBody = document.getElementById('confirmationModalBody');
    const confirmOkBtn = document.getElementById('confirmOkBtn');
    const confirmCancelBtn = document.getElementById('confirmCancelBtn');

    if (!confirmModalInstance) {
        confirmModalInstance = new bootstrap.Modal(confirmModalEl, {
            backdrop: 'static', // Prevent closing on backdrop click
            keyboard: false // Prevent closing with Esc key
        });

        const handleConfirm = () => {
            if (confirmResolve) confirmResolve(true);
            confirmModalInstance.hide();
        };

        const handleCancel = () => {
            if (confirmResolve) confirmResolve(false);
            confirmModalInstance.hide();
        };

        confirmOkBtn.addEventListener('click', handleConfirm);
        confirmCancelBtn.addEventListener('click', handleCancel);
        confirmModalEl.querySelector('.btn-close').addEventListener('click', handleCancel);
    }
    
    confirmModalBody.textContent = message;
    confirmModalInstance.show();

    return new Promise(resolve => {
        confirmResolve = resolve;
    });
}
