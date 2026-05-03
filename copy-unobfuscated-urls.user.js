// ==UserScript==
// @name         Copy Unobfuscated URLs
// @namespace    https://github.com/bryanvillarin/copy-unobfuscated-urls/
// @version      2.3.0
// @description  In Zendesk, adds a clipboard emoji next to an obfuscated URL that allows you to copy the actual URL. Handles spaced protocols, protocol-less paths, and span-fragmented URLs. Debug mode: add ?debug=copy-urls to URL.
// @author       Bryan Villarin
// @homepage     https://bryanvillarin.link
// @supportURL   https://bryanvillarin.link/contact/
// @license      MIT
// @match        *://*.zendesk.com/*
// @match        *://*.zdorigin.com/*
// @match        *://*.zdassets.com/*
// @match        *://*.zdusercontent.com/*
// @match        *://*.zopim.com/*
// @match        *://*.zopim.io/*
// @updateURL    https://raw.githubusercontent.com/bryanvillarin/copy-unobfuscated-urls/main/copy-unobfuscated-urls.user.js
// @downloadURL  https://raw.githubusercontent.com/bryanvillarin/copy-unobfuscated-urls/main/copy-unobfuscated-urls.user.js
// @grant        none
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function() {
    'use strict';

    // Debug mode - enable via URL parameter: ?debug=copy-urls
    const DEBUG = window.location.search.includes('debug=copy-urls');
    
    // Debug logging helper
    function log(...args) {
        if (DEBUG) console.log('[Copy Unobfuscated URLs]', ...args);
    }

    // Configuration
    const CONFIG = {
        iconOpacity: '0.5',
        iconOpacityHover: '1',
        checkmarkDuration: 2000, // milliseconds
    };

    // Regex pattern to detect ONLY obfuscated URLs (not normal ones)
    // Matches URLs with actual obfuscation markers:
    // - Bracketed protocols: https[://] or http[://] or hxxp[://]
    // - Modified protocols: hxxp, hXXp, h..p (not normal http/https)
    // - Modified dots: [.], dot, \. (not normal dots)
    // IMPORTANT: Greedy matching to capture entire URL as single match
    // IMPORTANT: (?:...)+ allows multiple obfuscated dots (e.g., example[.]wordpress[.]com)
    // Note: Spaced protocols like "hxxps :// example [.] com" are normalized by
    // preNormalizeText() before this pattern runs (see Fix #1 below)
    // Fix #2 (v2.1.0): Branch 3 now captures optional path after protocol-less domain
    // e.g. "example[.]org/category/path" — previously stopped at the TLD
    const OBFUSCATED_URL_PATTERN = /\b(h[xX.]{2}ps?|https?)\[:\/\/\][^\s<>]+|\b(h[xX.]{2}ps?):\/\/[^\s<>]+|[a-z0-9-]+(?:(\[\.\]| dot |\\.)[a-z0-9-]+)+(?:[^\s<>]*)?/gi;

    // Track processed nodes to avoid duplicate processing
    const processedNodes = new WeakSet();

    /**
     * Fix #1 (v2.1.0): Pre-normalize text to collapse spaced obfuscation like
     * "hxxps :// example [.] com / path" into "hxxps://example[.]com/path"
     * so the main regex can match it normally.
     * Guard clause makes this a no-op on text without spaced protocols — cheap.
     * @param {string} text
     * @returns {string}
     */
    function preNormalizeText(text) {
        if (!/h[xX.]{2}ps? :\/\//i.test(text)) return text;

        return text
            .replace(/\b(h[xX.]{2}ps?) :\/\/ /gi, '$1://')  // "hxxps :// " -> "hxxps://"
            .replace(/ \[\.\] /g, '[.]')                      // " [.] "     -> "[.]"
            .replace(/(\w|\]) \//g, '$1/')                    // "word /"    -> "word/"
            .replace(/\/ (\w)/g, '/$1');                      // "/ word"    -> "/word"
    }

    /**
     * Validate that a URL uses a safe protocol or is a protocol-less domain
     * @param {string} url - The URL to validate
     * @returns {boolean} - True if URL uses http/https or is a domain without protocol
     */
    function isSafeURL(url) {
        // If it has a protocol, validate it's http/https
        if (/^[a-z][a-z0-9+.-]*:/i.test(url)) {
            try {
                const parsed = new URL(url);
                return parsed.protocol === 'http:' || parsed.protocol === 'https:';
            } catch {
                return false;
            }
        }
        
        // Protocol-less: accept domain + optional path, block dangerous patterns
        // Fix #2 (v2.1.0): extended to allow path segments after the TLD
        // Blocks spaces, quotes, and other attack vectors; allows / . - _ ~ % = & ? #
        return /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?:\/[^\s'"<>]*)?$/i.test(url);
    }

    /**
     * Clean/unobfuscate a URL string
     */
    function unobfuscateURL(obfuscatedURL) {
        let cleaned = obfuscatedURL
            .replace(/hxxp/gi, 'http')
            .replace(/\[:\/\/\]/g, '://')  // Fix https[://] or http[://]
            .replace(/\[\.\]/g, '.')        // Fix [.]
            .replace(/ dot /gi, '.')
            .replace(/\\\./g, '.')
            .replace(/h\.\.p/gi, 'http')
            .trim();
        
        // Strip href.li wrapper to get actual destination URL
        const hrefLiMatch = cleaned.match(/https?:\/\/href\.li\/(.*)/i);
        if (hrefLiMatch && hrefLiMatch[1]) {
            const destination = hrefLiMatch[1];
            
            // Security: Only accept http/https destinations
            // This prevents javascript:, file://, data:, and other dangerous protocols
            if (/^https?:\/\//i.test(destination)) {
                cleaned = destination;
            }
            // If destination isn't http(s), keep the full href.li URL
        }
        
        return cleaned;
    }

    /**
     * Create clipboard icon element
     * @param {string} url - The URL to copy when clicked
     * @param {Object} customStyles - Optional custom styles to override defaults
     */
    function createClipboardIcon(url, customStyles = {}) {
        const icon = document.createElement('span');
        icon.textContent = '📋';
        
        // Base styles
        const baseStyles = {
            cursor: 'pointer',
            opacity: CONFIG.iconOpacity,
            transition: 'opacity 0.2s ease',
            marginRight: '6px',
            display: 'inline',
            userSelect: 'none',
            fontSize: '14px',
            verticalAlign: 'baseline',
        };
        
        // Merge custom styles
        const styles = { ...baseStyles, ...customStyles };
        
        // Convert to CSS string (handle camelCase to kebab-case)
        icon.style.cssText = Object.entries(styles)
            .map(([key, value]) => {
                const kebabKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
                return `${kebabKey}: ${value}`;
            })
            .join('; ');
        
        icon.setAttribute('aria-label', 'Copy unobfuscated URL');
        icon.setAttribute('role', 'button');
        icon.setAttribute('tabindex', '0');

        // Hover effect
        icon.addEventListener('mouseenter', () => {
            icon.style.opacity = CONFIG.iconOpacityHover;
        });
        icon.addEventListener('mouseleave', () => {
            if (icon.textContent === '📋') {
                icon.style.opacity = CONFIG.iconOpacity;
            }
        });

        // Click handler
        icon.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            copyToClipboard(url, icon);
        });

        // Keyboard accessibility
        icon.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                copyToClipboard(url, icon);
            }
        });

        return icon;
    }

    /**
     * Copy text to clipboard and show feedback
     */
    async function copyToClipboard(text, iconElement) {
        // Security check: Only copy safe URLs
        if (!isSafeURL(text)) {
            console.error('[Copy Unobfuscated URLs] Blocked unsafe URL:', text);
            return;
        }

        try {
            await navigator.clipboard.writeText(text);
            showCopyFeedback(iconElement);
        } catch (err) {
            console.error('Failed to copy to clipboard:', err);
            // Fallback for older browsers
            fallbackCopy(text, iconElement);
        }
    }

    /**
     * Fallback copy method for browsers without clipboard API
     */
    function fallbackCopy(text, iconElement) {
        // Security check: Only copy safe URLs
        if (!isSafeURL(text)) {
            console.error('[Copy Unobfuscated URLs] Blocked unsafe URL:', text);
            return;
        }

        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        
        try {
            document.execCommand('copy');
            showCopyFeedback(iconElement);
        } catch (err) {
            console.error('Fallback copy failed:', err);
        } finally {
            document.body.removeChild(textarea);
        }
    }

    /**
     * Show visual feedback after copying
     */
    function showCopyFeedback(iconElement) {
        const originalEmoji = iconElement.textContent;
        iconElement.textContent = '✅';
        iconElement.style.opacity = CONFIG.iconOpacityHover;

        setTimeout(() => {
            iconElement.textContent = originalEmoji;
            iconElement.style.opacity = CONFIG.iconOpacity;
        }, CONFIG.checkmarkDuration);
    }

    /**
     * Process ticket subject line (single ticket view only)
     */
    function processTicketSubject() {
        try {
            log('Looking for ticket subject...');
            
            // Selector for ticket subject input in single ticket view
            const subjectInput = document.querySelector('[data-test-id="omni-header-subject"]');
            
            log('Subject input:', subjectInput ? 'FOUND' : 'not found');
            
            if (subjectInput && !subjectInput.hasAttribute('data-clipboard-added')) {
                const subjectText = subjectInput.value || subjectInput.textContent;
                log('Subject text:', subjectText);
                
                const matches = [...subjectText.matchAll(OBFUSCATED_URL_PATTERN)];
                log('Found', matches.length, 'obfuscated URLs in subject');
                
                if (matches.length > 0) {
                    log('Found obfuscated URL in subject:', matches[0][0]);
                    
                    const cleanURL = unobfuscateURL(matches[0][0]);
                    
                    // Create icon with custom positioning styles for subject line
                    const icon = createClipboardIcon(cleanURL, {
                        position: 'relative',
                        zIndex: '10'
                    });
                    
                    // Find the field container (parent of the input's parent span)
                    const inputWrapper = subjectInput.parentElement;
                    const fieldContainer = inputWrapper ? inputWrapper.parentElement : null;
                    
                    if (fieldContainer) {
                        // Insert at the beginning of the field container
                        fieldContainer.insertBefore(icon, fieldContainer.firstChild);
                        subjectInput.setAttribute('data-clipboard-added', 'true');
                        log('✅ Added clipboard to subject field container');
                    }
                }
            } else {
                log('No subject input found or already processed');
            }
        } catch (err) {
            console.error('[Copy Unobfuscated URLs] Error processing subject:', err);
        }
    }

    /**
     * Process a text node and add clipboard icons
     */
    function processTextNode(node) {
        try {
            if (!node.nodeValue || processedNodes.has(node)) {
                return;
            }

            // Defense-in-depth: Skip extremely long text nodes (likely not user content)
            if (node.nodeValue.length > 50000) {
                return;
            }

            log('Examining text node:', node.nodeValue.substring(0, 100));

            // Skip processing inside critical elements
            const SKIP_TAGS = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'TEXTAREA', 'INPUT', 'SELECT', 'CODE', 'PRE', 'BLOCKQUOTE'];
            let parent = node.parentElement;
            let isSubjectCell = false;
            
            while (parent) {
                if (SKIP_TAGS.includes(parent.tagName)) {
                    log('Skipped - inside', parent.tagName);
                    return;
                }
                
                // Skip search inputs and header navigation
                if (parent.tagName === 'HEADER' || 
                    parent.tagName === 'NAV') {
                    log('Skipped - inside HEADER/NAV');
                    return;
                }
                
                // Skip search input fields
                if (parent.getAttribute('role') === 'search' ||
                    parent.getAttribute('type') === 'search' ||
                    (parent.tagName === 'FORM' && parent.querySelector('input[type="search"]'))) {
                    log('Skipped - inside search form');
                    return;
                }
                
                // Check if we're in a ticket list table
                const inTicketListTable = parent.getAttribute('data-test-id') === 'generic-table' ||
                    (parent.classList.contains('table') && parent.closest('[data-test-id="views-table"]'));
                
                if (inTicketListTable) {
                    log('Inside ticket list table');
                    
                    // Find the closest TD/TH ancestor
                    let cell = node.parentElement;
                    while (cell && cell.tagName !== 'TD' && cell.tagName !== 'TH') {
                        cell = cell.parentElement;
                        // Stop if we've climbed out of the table
                        if (!cell || cell.getAttribute('data-test-id') === 'generic-table') {
                            break;
                        }
                    }
                    
                    if (cell && (cell.tagName === 'TD' || cell.tagName === 'TH')) {
                        // We found a table cell - check if it's a Subject cell
                        const hasLink = cell.querySelector('a');
                        const hasSubstantialText = cell.textContent.trim().length > 20;
                        
                        log('Table cell check - hasLink:', !!hasLink, 'hasSubstantialText:', hasSubstantialText, 'text length:', cell.textContent.trim().length);
                        
                        if (hasLink && hasSubstantialText) {
                            // This looks like a Subject cell - mark it for special handling
                            isSubjectCell = true;
                            log('Marked as Subject cell');
                            break;
                        } else {
                            // Not a Subject cell - skip processing
                            log('Skipped - not a Subject cell');
                            return;
                        }
                    } else {
                        // We're in the table but couldn't find a cell - skip
                        log('Skipped - in table but not in cell');
                        return;
                    }
                }
                
                parent = parent.parentElement;
            }

            const text = preNormalizeText(node.nodeValue);
            const matches = [...text.matchAll(OBFUSCATED_URL_PATTERN)];

            log('Found', matches.length, 'obfuscated URLs');

            // If no matches, skip processing
            if (matches.length === 0) {
                return;
            }

            // Mark this node as processed
            processedNodes.add(node);
            
            // Special handling for Subject cells in ticket list tables
            if (isSubjectCell) {
                log('Processing Subject cell');
                // Find the parent TD/TH cell
                let cell = node.parentElement;
                while (cell && cell.tagName !== 'TD' && cell.tagName !== 'TH') {
                    cell = cell.parentElement;
                }
                
                log('Found cell:', cell ? cell.tagName : 'none');
                
                if (cell && !cell.hasAttribute('data-clipboard-added')) {
                    // Get the first obfuscated URL in this cell
                    const firstMatch = matches[0];
                    const cleanURL = unobfuscateURL(firstMatch[0]);
                    
                    log('Adding clipboard icon for:', cleanURL);
                    
                    // Create clipboard icon
                    const icon = createClipboardIcon(cleanURL);
                    
                    // Find the link or text container inside the cell (skip over wrapper divs)
                    let targetElement = cell.querySelector('a') || cell;
                    
                    // If we found a link, insert at the beginning of the link
                    if (targetElement.tagName === 'A') {
                        targetElement.insertBefore(icon, targetElement.firstChild);
                    } else {
                        // No link found, insert at cell level with wrapper
                        const wrapper = document.createElement('span');
                        wrapper.style.cssText = 'display: inline; white-space: nowrap;';
                        wrapper.appendChild(icon);
                        cell.insertBefore(wrapper, cell.firstChild);
                    }
                    
                    // Mark cell as processed to avoid duplicate icons
                    cell.setAttribute('data-clipboard-added', 'true');
                    
                    log('✅ Added clipboard to Subject cell');
                }
                return; // Don't modify the actual text content in Subject cells
            }

            log('Processing as regular content (not Subject cell)');

            // Normal processing for ticket content (not Subject cells)
            // Create a document fragment to hold the new content
            const fragment = document.createDocumentFragment();
            let lastIndex = 0;
            let iconsAdded = 0;

            matches.forEach(match => {
                const obfuscatedURL = match[0];
                
                // Skip if it looks like an email address
                // Check if there's an @ immediately before the match (like "user@domain.com")
                const charBeforeMatch = text.charAt(match.index - 1);
                
                if (charBeforeMatch === '@') {
                    log('Skipping email domain:', obfuscatedURL);
                    return; // This is part of an email address
                }
                
                log('Processing URL:', obfuscatedURL);
                
                const cleanURL = unobfuscateURL(obfuscatedURL);
                const matchIndex = match.index;

                // Add text before the match
                if (matchIndex > lastIndex) {
                    const beforeText = document.createTextNode(text.substring(lastIndex, matchIndex));
                    processedNodes.add(beforeText); // Mark as processed
                    fragment.appendChild(beforeText);
                }

                // Add clipboard icon
                const icon = createClipboardIcon(cleanURL);
                fragment.appendChild(icon);
                iconsAdded++;

                // Add the obfuscated URL text
                const urlText = document.createTextNode(obfuscatedURL);
                processedNodes.add(urlText); // Mark as processed
                fragment.appendChild(urlText);

                lastIndex = matchIndex + obfuscatedURL.length;
            });

            // Add remaining text
            if (lastIndex < text.length) {
                const remainingText = document.createTextNode(text.substring(lastIndex));
                processedNodes.add(remainingText); // Mark as processed
                fragment.appendChild(remainingText);
            }

            // Only replace if we actually added icons
            if (iconsAdded > 0 && node.parentNode) {
                // Fix #4 (v2.3.0): Mark the closest ancestor span as processed BEFORE
                // replacing the node. This prevents processSpanNode from running its own
                // querySelectorAll pass on the same span and adding a duplicate icon.
                // processedNodes (WeakSet on text nodes) and data-clipboard-added (DOM attr
                // on element nodes) are two separate guard mechanisms — this bridges them.
                const ancestorSpan = node.parentElement?.closest('span');
                if (ancestorSpan) {
                    ancestorSpan.setAttribute('data-clipboard-added', 'true');
                }

                node.parentNode.replaceChild(fragment, node);
                log(`Added ${iconsAdded} icon(s)`);
            }
        } catch (err) {
            console.error('[Copy Unobfuscated URLs] Error in processTextNode:', err);
        }
    }

    /**
     * Fix #3 (v2.2.0): Handle spans where Zendesk splits obfuscated URLs into
     * mixed text/element children — e.g. "hxxps" + <span>[://]</span> + "domain" +
     * <span>[.]</span> + "com". Each fragment is invisible to the TreeWalker, but
     * the parent span's textContent reassembles the full URL.
     * @param {Element} span - A <span> element to inspect
     */
    function processSpanNode(span) {
        try {
            // Fix #4 (v2.3.0): Check FIRST — before the mixed-content gate below.
            // processTextNode marks this span's data-clipboard-added attribute before
            // calling replaceChild. If we only checked after the mixed-content test,
            // a plain-text span (hasText=true, hasElements=false) would still slip
            // through and get a second icon added by this function.
            if (span.hasAttribute('data-clipboard-added')) return;

            // Only act on spans with mixed content (text nodes + child elements)
            const childNodes = span.childNodes;
            let hasText = false;
            let hasElements = false;
            for (const node of childNodes) {
                if (node.nodeType === Node.TEXT_NODE && node.nodeValue.trim()) hasText = true;
                if (node.nodeType === Node.ELEMENT_NODE) hasElements = true;
            }
            if (!hasText || !hasElements) return;

            const text = span.textContent;
            if (!text || text.length > 50000) return;

            const matches = [...text.matchAll(new RegExp(OBFUSCATED_URL_PATTERN.source, 'gi'))];
            if (matches.length === 0) return;

            log('processSpanNode matched:', text.substring(0, 100));

            const cleanURL = unobfuscateURL(matches[0][0]);
            const icon = createClipboardIcon(cleanURL);

            span.parentNode.insertBefore(icon, span);
            span.setAttribute('data-clipboard-added', 'true');

            log('✅ Added clipboard icon before stitched span');
        } catch (err) {
            console.error('[Copy Unobfuscated URLs] Error in processSpanNode:', err);
        }
    }

    /**
     * Walk through DOM tree and process text nodes
     */
    function processNode(node) {
        try {
            if (node.nodeType === Node.TEXT_NODE) {
                processTextNode(node);
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                // Skip script, style, and already processed elements
                if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(node.tagName)) {
                    return;
                }

                // Fix #3: spans with stitched obfuscated content are handled
                // by the querySelectorAll pass below — no need to check here
                // Process child nodes
                const walker = document.createTreeWalker(
                    node,
                    NodeFilter.SHOW_TEXT,
                    null,
                    false
                );

                const textNodes = [];
                let currentNode;
                while (currentNode = walker.nextNode()) {
                    textNodes.push(currentNode);
                }

                textNodes.forEach(processTextNode);

                // Fix #3: second pass for spans with mixed content (text + child elements)
                // The TreeWalker above only visits text nodes and misses these entirely
                const spans = node.querySelectorAll('span');
                spans.forEach(processSpanNode);
            }
        } catch (err) {
            console.error('[Copy Unobfuscated URLs] Error in processNode:', err);
        }
    }

    /**
     * Initialize script
     */
    function init() {
        try {
            log('Starting initialization...');
            
            // Verify document.body exists
            if (!document.body) {
                console.error('[Copy Unobfuscated URLs] document.body not found, retrying...');
                setTimeout(init, 1000);
                return;
            }

            let isProcessing = false;

            // Set up MutationObserver for dynamic content
            const observer = new MutationObserver((mutations) => {
                // Prevent recursive processing
                if (isProcessing) {
                    return;
                }

                isProcessing = true;
                
                // Temporarily disconnect to prevent observing our own changes
                observer.disconnect();

                try {
                    mutations.forEach((mutation) => {
                        mutation.addedNodes.forEach((node) => {
                            try {
                                if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) {
                                    processNode(node);
                                }
                            } catch (err) {
                                console.error('[Copy Unobfuscated URLs] Error processing node:', err);
                            }
                        });
                    });
                } finally {
                    // Reconnect observer after processing
                    observer.observe(document.body, {
                        childList: true,
                        subtree: true,
                    });
                    
                    isProcessing = false;
                }
            });

            // Start observing
            observer.observe(document.body, {
                childList: true,
                subtree: true,
            });

            log('✅ Observer started, scanning existing content...');

            // SAFELY process existing content after observer is set up
            // Target only likely content areas to avoid breaking Zendesk's core UI
            setTimeout(() => {
                try {
                    log('Processing existing ticket content...');
                    
                    // Look for common Zendesk content containers
                    const contentSelectors = [
                        '[data-test-id="ticket-conversation"]',  // Ticket conversation area
                        '[data-test-id="omni-log-container"]',   // Comment/activity log
                        '.ticket-thread',                         // Thread container
                        '.comment',                               // Individual comments
                        '[role="article"]',                       // Article content
                        '[data-test-id="generic-table"]',         // Ticket list tables (search/views)
                    ];

                    let nodesProcessed = 0;
                    contentSelectors.forEach(selector => {
                        const containers = document.querySelectorAll(selector);
                        log(`Found ${containers.length} elements for selector: ${selector}`);
                        containers.forEach(container => {
                            processNode(container);
                            nodesProcessed++;
                        });
                    });

                    log(`Processed ${nodesProcessed} content containers`);
                    
                    // Also process ticket subject line (single ticket view)
                    processTicketSubject();
                } catch (err) {
                    console.error('[Copy Unobfuscated URLs] Error processing existing content:', err);
                }
            }, 1000); // Additional 1 second after observer starts

            // Fallback scan for slow-loading ticket list tables (large search results/views)
            setTimeout(() => {
                try {
                    const ticketListTable = document.querySelector('[data-test-id="generic-table"]');
                    if (ticketListTable) {
                        log('Running 8-second fallback scan for ticket list table...');
                        processNode(ticketListTable);
                    }
                    
                    // Also check ticket subject again in case it loaded late
                    processTicketSubject();
                } catch (err) {
                    console.error('[Copy Unobfuscated URLs] Error in fallback scan:', err);
                }
            }, 8000); // 8 seconds total - catches slow-loading large tables

        } catch (err) {
            console.error('[Copy Unobfuscated URLs] ❌ Initialization failed:', err);
        }
    }

    // Start the script with a longer delay to let Zendesk fully stabilize
    log('Script loaded, waiting for page to stabilize...');
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(init, 4000); // 4 seconds for Zendesk to finish initial render
        });
    } else {
        setTimeout(init, 4000); // 4 seconds
    }
})();
