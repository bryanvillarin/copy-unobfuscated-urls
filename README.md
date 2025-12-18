# Copy Unobfuscated URLs for Zendesk

Security folks obfuscate URLs to prevent accidental clicks. You know the ones: `hxxps://example[.]com`, `example dot com`. I finally got tired of manually rewriting parts of these obfuscated URLs in Zendesk tickets before investigating and replying to complainants. That's friction.

Using [Claude](https://claude.ai), I built a [Tampermonkey](https://www.tampermonkey.net/) userscript that spots these obfuscated URLs within Zendesk, then adds a clickable clipboard (📋) emoji to the left of them. One click, and the clean URL gets copied to your clipboard. Done. 😌

## Contents

- [What It Does](#what-it-does)
- [Installation](#installation)
- [Patterns It Catches](#patterns-it-catches)
- [Visual Feedback](#visual-feedback)
- [Smart Exclusions](#smart-exclusions)
- [Under the Hood](#under-the-hood)
- [Supported Domains](#supported-domains)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)
- [Accessibility](#accessibility)
- [Version History](#version-history)
- [Files](#files)
- [Ideas for Later](#ideas-for-later)
- [Contributing](#contributing)
- [License](#license)
️
## What It Does

The script scans Zendesk pages, and:

- Detects obfuscated URLs. *(ignores normal ones)*
- Adds a clipboard (📋) emoji next to each one.
- Clicking the clipboard emoji copies the clean, working URL to your clipboard.
- When applicable, it strips the [`href.li`](https://href.li) prefix to copy the working URL without that prefix.
- Skips email addresses, blockquotes, code blocks, and UI chrome.

Here's the transformation:

```
You see:     hxxps://href[.]li/hxxps://example[.]com/path
You click:   📋
You get:     https://example.com/path
```

## Installation

Takes _maybe_ two minutes. Here's what to do:

1. Install [Tampermonkey](https://www.tampermonkey.net/) for your browser.
2. Click [`copy-unobfuscated-urls.user.js`](https://raw.githubusercontent.com/bryanvillarin/copy-unobfuscated-urls/main/copy-unobfuscated-urls.user.js).
3. When Tampermonkey prompts you to install. Click **Install**.
4. In Zendesk, search for tickets that have obfuscated URLs, or view a single ticket that has obfuscated URL.

The script runs automatically. No config needed.

## Patterns It Catches

**Obfuscated protocols:**

- `hxxp://` or `hxxps://` → `http://` or `https://`
- `hXXps://` → `https://`
- `h..ps://` → `https://`
- `https[://]` or `http[://]` → proper protocol
- `hxxp[://]` → `http://`

**Obfuscated domains:**

- `example[.]com` → `example.com`
- `example dot com` → `example.com`
- `example\.com` → `example.com`

**Wrapped URLs:**

- `href.li/https://actual-site.com` → `https://actual-site.com`

## Visual Feedback

- Default: Emoji sits at 50% opacity
- Hover: Brightens to 100%
- After copy: Green checkmark (✅) emoji is displayed for two seconds.

The emoji appears to the left of the obfuscated URL with breathing room.

**Bonus: Content tables.** The script also processes tables inside ticket bodies.

## Smart Exclusions

The script knows when to stay out of the way:

- **Normal URLs:** `https://example.com` or `WordPress.com`.
- **Email addresses**
- **Blockquotes:** Skips quoted text.
- **Code blocks:** Skips `<code>` and `<pre>` tags.
- **Form inputs:** Skips `<textarea>`, `<input>`, and `<select>`.
- **UI tables:** Skips Zendesk's ticket list checkboxes and status columns.

## Under the Hood

How the timing works:

1. **3 seconds:** Waits for Zendesk to stabilize.
2. **4 seconds:** Scans ticket content areas.
3. **8 seconds:** Fallback scan for large search results. *(e.g. 5,000+ tickets load slowly.)*
4. **Ongoing:** `MutationObserver` watches for new content, like comments, or tickets that load dynamically.

The script uses targeted CSS selectors to scan ticket content, not the entire Zendesk UI chrome. A 50,000 character limit on text nodes prevents runaway regex. All DOM manipulation uses `createElement()` and `createTextNode()` to avoid XSS.

## Supported Domains

Runs on all Zendesk infrastructure:

- `*.zendesk.com`
- `*.zdorigin.com`
- `*.zdassets.com`
- `*.zdusercontent.com`
- `*.zopim.com`
- `*.zopim.io`

## Configuration

If you want to tweak things, edit these constants:

```javascript
const CONFIG = {
    iconOpacity: '0.5',           // Default transparency
    iconOpacityHover: '1',        // Hover transparency
    checkmarkDuration: 2000,      // Milliseconds to show ✅
};
```

## Troubleshooting

**Icons not appearing?**

- Check browser console for errors *(filter by `[Copy Unobfuscated URLs]`)*
- Verify Tampermonkey is enabled for the domain
- Make sure the URL is actually obfuscated—normal URLs won't show icons
- Wait 8 seconds on large search results
- Refresh after installing

**Copy not working?**

- Grant clipboard permissions in browser settings
- Fallback uses `document.execCommand()` for older browsers

**Page slowing down?**

- Check for text nodes >50k characters
- Disable/re-enable script to reset the observer

## Accessibility

- ARIA labels for screen readers
- Keyboard nav with Enter/Space
- Proper `role` and `tabindex` attributes

## Version History

- **v1.0.0** — Publicly released on GitHub! ✨️
- **v0.3.7** — Fixed multi-dot domain matching *(e.g., `example[.]wordpress[.]com` now captured fully)*
- **v0.3.6** — Fixed split URL matching *(bracketed protocols now captured as single match)*
- **v0.3.5** — Added 8-second fallback scan for slow-loading large search results
- **v0.3.4** — Fixed checkbox column detection
- **v0.3.3** — Simplified table cell skip logic
- **v0.3.2** — Smart table detection *(skip UI tables, allow content tables)*
- **v0.3.1** — Added bracket-style protocol support
- **v0.3.0** — **Critical:** Only detect genuinely obfuscated URLs. (Also, _privately_ released to my immediate teammates at work!) ✨️
- **v0.2.7** — Duplicate icon prevention
- **v0.2.6** — Targeted existing content scan
- **v0.2.5** — Improved email detection with debug logging
- **v0.2.4** — Email exclusion and blockquote skip
- **v0.2.3** — Fixed infinite CPU loop *(disconnect/reconnect pattern)*
- **v0.2.2** — Removed initial scan to fix page load
- **v0.2.1** — Comprehensive error handling
- **v0.2.0** — Removed "Copy all" feature, fixed page load issues
- **v0.1.4** — ReDoS hardening *(50k char limit)*
- **v0.1.3** — Security patch for protocol validation
- **v0.1.2** — href.li stripping feature
- **v0.1.1** — href.li exclusion *(reverted in v0.1.2)*
- **v0.1.0** — Initial _private_ release to myself! ✨️

## Files

```
.
├── copy-unobfuscated-urls.user.js  # The script
├── ideas.md                                 # Future enhancements
└── README.md                                # You're here
```

## Ideas for Later

See [`ideas.md`](ideas.md) for what's _potentially_ on deck:

- Strip tracking parameters from URLs
- Test tables with obfuscated URLs

## Contributing

Found a bug? Have an idea?

- Open an issue on GitHub
- Reach out: [bryanvillarin.link/contact](https://bryanvillarin.link/contact/)

## License

MIT License — see the script header for details.

---

* **Bryan Villarin**  
* [bryanvillarin.link](https://bryanvillarin.link) · [allnarfedup.blog](https://allnarfedup.blog)