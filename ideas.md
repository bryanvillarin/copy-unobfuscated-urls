# Ideas

Here are things I'm considering for future versions. No promises on timing.

---

## [Feature] Strip Tracking Parameters from URLs

Here's the thing: when the script copies the obfuscated URL, it copies everything after the prefix as-is. So a URL like:

```
hxxps://example.com?tracking=xyz&utm_source=email
```

Gets copied as:

```
https://example.com?tracking=xyz&utm_source=email
```

That's... fine. But not *clean*. All those `utm_*`, `fbclid`, `gclid` params? Surveillance cruft. Would be nice to strip them too.

**The questions:**

- Whitelist approach *(keep known functional params)* vs blacklist approach *(remove known tracking params)*—which is safer?
- URL parsing has edge cases. Lots of them.
- Should users toggle between "aggressive" and "conservative" cleaning?
- Performance hit from regex-heavy parameter parsing—worth measuring

**Why it matters:** You copy a URL to share or investigate. The cleaner it is, the less noise you carry forward.

---

## [Test] Tables with Obfuscated URLs

Since v0.3.2, the script skips Zendesk UI tables *(ticket list, status columns)* but processes tables inside ticket content *(email bodies, pasted HTML)*.

Need to verify this actually works.

**Test scenario:** Find or create a ticket with an HTML table containing an obfuscated URL:

```html
<table>
  <tr>
    <td>Malicious site:</td>
    <td>hxxps://evil[.]com</td>
  </tr>
</table>
```

The script should show a clipboard icon inline with `hxxps://evil[.]com` inside that table cell.

**Search query to find existing examples:**

```
body:"<table" type:ticket
```

Or just paste the HTML snippet into a test ticket and see what happens.

---

*Do you have any other ideas? Please reach out at [bryanvillarin.link/contact](https://bryanvillarin.link/contact/)!*