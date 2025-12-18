// ==UserScript==
// @name         Copy Unobfuscated URLs
// @namespace    https://github.com/bryanvillarin/copy-unobfuscated-urls/
// @version      1.0.0
// @description  In Zendesk, adds a clipboard emoji next to an obfuscated URL that allows you to copy the actual URL.
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
// @icon         📋
// @updateURL    https://raw.githubusercontent.com/bryanvillarin/copy-unobfuscated-urls/main/copy-unobfuscated-urls.user.js
// @downloadURL  https://raw.githubusercontent.com/bryanvillarin/copy-unobfuscated-urls/main/copy-unobfuscated-urls.user.js
// @grant        none
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function() {
    'use strict';

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
    const OBFUSCATED_URL_PATTERN = /\b(h[xX.]{2}ps?|https?)\[:\/\/\][^\s<>]+|\b(h[xX.]{2}ps?):\/\/[^\s<>]+|[a-z0-9-]+(?:(\[\.\]| dot |\\.)[a-z0-9-]+)+/gi;

    // Track processed nodes to avoid duplicate processing
    const processedNodes = new WeakSet();

    /**
     * Clean/unobfuscate a URL string
     */
    function unobfuscateURL(obfuscatedURL) {
        let cleaned = obfuscatedURL
            .replace(/hxxp/gi, 'http')
            .replace(/\[:\/\/\]/g, '://') // Fix https[://] or http[://]
            .replace(/\[\.\]/g, '.')       // Fix [.]
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
     */
    function createClipboardIcon(url) {
        const icon = document.createElement('span');
        icon.textContent = '📋';
        icon.style.cssText = `
            cursor: pointer;
            opacity: ${CONFIG.iconOpacity};
            transition: opacity 0.2s ease;
            margin-right: 4px;
            display: inline-block;
            user-select: none;
            font-size: 14px;
        `;
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

            // Skip processing inside critical elements
            const SKIP_TAGS = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'TEXTAREA', 'INPUT', 'SELECT', 'CODE', 'PRE', 'BLOCKQUOTE'];
            let parent = node.parentElement;
            while (parent) {
                if (SKIP_TAGS.includes(parent.tagName)) {
                    return;
                }
                
                // Skip specific problematic areas in tables
                if (parent.tagName === 'TD' || parent.tagName === 'TH') {
                    // Skip if this cell is ONLY a checkbox (status/selection column)
                    // Don't skip if it has substantial content (like subject with checkbox)
                    const hasCheckbox = parent.querySelector('input[type="checkbox"]');
                    const cellText = parent.textContent.trim();
                    
                    // If cell has checkbox AND very little text, it's a selection column
                    if (hasCheckbox && cellText.length < 20) {
                        return;
                    }
                }
                
                parent = parent.parentElement;
            }

            const text = node.nodeValue;
            const matches = [...text.matchAll(OBFUSCATED_URL_PATTERN)];

            if (matches.length === 0) {
                return;
            }

            // Check if we've already added icons to this text node's siblings
            // Look for our clipboard emoji in adjacent nodes
            if (node.previousSibling && 
                node.previousSibling.nodeType === Node.ELEMENT_NODE &&
                node.previousSibling.getAttribute &&
                node.previousSibling.getAttribute('aria-label') === 'Copy unobfuscated URL') {
                console.log('[Copy Unobfuscated URLs] Icons already exist for this text, skipping');
                processedNodes.add(node);
                return;
            }

            // Mark this node as processed
            processedNodes.add(node);

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
                    console.log('[Copy Unobfuscated URLs] Skipping email domain:', obfuscatedURL);
                    return; // This is part of an email address
                }
                
                console.log('[Copy Unobfuscated URLs] Processing URL:', obfuscatedURL);
                
                const cleanURL = unobfuscateURL(obfuscatedURL);
                const matchIndex = match.index;

                // Add text before the match
                if (matchIndex > lastIndex) {
                    fragment.appendChild(
                        document.createTextNode(text.substring(lastIndex, matchIndex))
                    );
                }

                // Add clipboard icon
                const icon = createClipboardIcon(cleanURL);
                fragment.appendChild(icon);
                iconsAdded++;

                // Add the obfuscated URL text
                fragment.appendChild(document.createTextNode(obfuscatedURL));

                lastIndex = matchIndex + obfuscatedURL.length;
            });

            // Add remaining text
            if (lastIndex < text.length) {
                fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
            }

            // Only replace if we actually added icons
            if (iconsAdded > 0 && node.parentNode) {
                node.parentNode.replaceChild(fragment, node);
                console.log(`[Copy Unobfuscated URLs] Added ${iconsAdded} icon(s)`);
            }
        } catch (err) {
            console.error('[Copy Unobfuscated URLs] Error in processTextNode:', err);
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
            console.log('[Copy Unobfuscated URLs] Starting initialization...');
            
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

            console.log('[Copy Unobfuscated URLs] ✅ Observer started, scanning existing content...');

            // SAFELY process existing content after observer is set up
            // Target only likely content areas to avoid breaking Zendesk's core UI
            setTimeout(() => {
                try {
                    console.log('[Copy Unobfuscated URLs] Processing existing ticket content...');
                    
                    // Look for common Zendesk content containers
                    const contentSelectors = [
                        '[data-test-id="ticket-conversation"]',  // Ticket conversation area
                        '[data-test-id="omni-log-container"]',   // Comment/activity log
                        '.ticket-thread',                         // Thread container
                        '.comment',                               // Individual comments
                        '[role="article"]',                       // Article content
                    ];

                    let nodesProcessed = 0;
                    contentSelectors.forEach(selector => {
                        const containers = document.querySelectorAll(selector);
                        containers.forEach(container => {
                            processNode(container);
                            nodesProcessed++;
                        });
                    });

                    console.log(`[Copy Unobfuscated URLs] Processed ${nodesProcessed} content containers`);
                } catch (err) {
                    console.error('[Copy Unobfuscated URLs] Error processing existing content:', err);
                }
            }, 1000); // Additional 1 second after observer starts

            // Fallback scan for slow-loading search results (large tables)
            setTimeout(() => {
                try {
                    const searchResults = document.querySelector('[data-test-id="generic-table"]');
                    if (searchResults) {
                        console.log('[Copy Unobfuscated URLs] Running fallback scan for search results...');
                        processNode(searchResults);
                    }
                } catch (err) {
                    console.error('[Copy Unobfuscated URLs] Error in fallback scan:', err);
                }
            }, 8000); // 8 seconds total - catches slow-loading large tables

        } catch (err) {
            console.error('[Copy Unobfuscated URLs] ❌ Initialization failed:', err);
        }
    }

    // Start the script with a longer delay to let Zendesk fully stabilize
    console.log('[Copy Unobfuscated URLs] Script loaded, waiting for page to stabilize...');
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(init, 3000); // 3 seconds for Zendesk to finish initial render
        });
    } else {
        setTimeout(init, 3000); // 3 seconds
    }
})();
