# Google Meet Auto Record (Workspace)

A Chrome extension that automatically enables recording, transcription, and Gemini notes for Google Meet meetings.

**Requires Google Workspace with recording enabled by your admin.**

[![GitHub](https://img.shields.io/badge/GitHub-Repository-blue)](https://github.com/georgiai1/meet-auto-record)
[![Privacy Policy](https://img.shields.io/badge/Privacy-Policy-green)](PRIVACY_POLICY.md)

## Features

- **Google Calendar Integration**: Automatically configures recording settings when creating meetings with Google Meet
  - Enables "Take notes with Gemini"
  - Enables "Transcribe the meeting"
  - Enables "Record the meeting"
  - Sets language to English

- **Google Meet Auto-Recording**: Automatically starts recording when you join a meeting
  - Detects when you join a meeting
  - Checks if recording is already active
  - Starts recording with all options enabled
  - Handles consent dialogs automatically

- **Visual Feedback**
  - Toast notifications for status updates
  - Activity indicator when extension is working
  - Success/error messages for all actions

## Installation

### From Chrome Web Store

*Coming soon*

### Manual Installation (Developer Mode)

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the `extension` folder
6. The extension should now be active

### Generate Icons (if missing)

1. Open `extension/icons/generate-icons.html` in Chrome
2. Click "Download All" to download the icon files
3. Save `icon16.png`, `icon48.png`, and `icon128.png` to the `extension/icons/` folder

## Usage

### Google Calendar

1. Create a new event in Google Calendar
2. Add Google Meet video conferencing
3. The extension will automatically:
   - Open "Video call options"
   - Switch to "Meeting records" tab
   - Select English as the language
   - Enable all recording options
   - Save the settings

### Google Meet

1. Join a Google Meet call
2. Wait 3 seconds after joining
3. The extension will automatically:
   - Open Meeting tools
   - Navigate to Recording
   - Enable transcript and Gemini notes
   - Click "Start recording"
   - Handle consent dialogs

## Requirements

- **Google Workspace account** with recording feature enabled by your admin
- You must be the **meeting organizer** or have recording permissions
- Recording features are **not available** on free Google accounts

## Permissions

| Permission | Purpose |
|------------|---------|
| `storage` | Saves extension preferences locally |
| `activeTab` | Interacts with current Calendar/Meet tab |
| `calendar.google.com` | Configures meeting recording settings |
| `meet.google.com` | Auto-starts recording in meetings |

## Troubleshooting

### Recording doesn't start automatically

1. Make sure you're the meeting organizer or have recording permissions
2. Check if recording is already active (look for "Recording" indicator)
3. Verify your Google Workspace account has recording enabled

### Extension not working

1. Refresh the page after installing the extension
2. Check the browser console for error messages (search for "Meet Auto Record")
3. Make sure the extension is enabled in `chrome://extensions/`

## Project Structure

```
meet-auto-record/
├── extension/                 # Chrome extension files
│   ├── manifest.json
│   ├── content-calendar.js
│   ├── content-meet.js
│   ├── styles.css
│   └── icons/
├── releases/                  # Packaged releases
│   └── google-meet-auto-record-v1.0.0.zip
├── README.md
└── PRIVACY_POLICY.md
```

## Debug Mode

Open the browser console and access debug functions:

```javascript
// Show toast notification
window.__meetAutoRecord.showToast('info', 'Title', 'Message');

// Check if recording is active
window.__meetAutoRecord.isRecordingActive();

// Manually trigger auto-recording
window.__meetAutoRecord.startAutoRecording();
```

## Privacy

This extension does not collect, store, or transmit any personal data. All functionality runs locally in your browser. See our [Privacy Policy](PRIVACY_POLICY.md) for details.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request on [GitHub](https://github.com/georgiai1/meet-auto-record).

## License

MIT License
