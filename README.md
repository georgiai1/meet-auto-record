# Meet Auto Record

A Chrome extension that automatically enables recording, transcription, and Gemini notes for Google Meet meetings.

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

### 1. Generate Icons

1. Open `icons/generate-icons.html` in Chrome
2. Click "Download All" to download the icon files
3. Save `icon16.png`, `icon48.png`, and `icon128.png` to the `icons/` folder

### 2. Load Extension in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `meet-auto-record` folder
5. The extension should now be active

## Usage

### Google Calendar

1. Create a new event in Google Calendar
2. Add Google Meet video conferencing
3. Click on "Video call options" (settings icon)
4. The extension will automatically:
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

## Permissions Required

- **calendar.google.com**: To detect and configure meeting settings
- **meet.google.com**: To auto-start recording in meetings

## Notes

- Recording can only be started if you are the meeting organizer or have recording permissions
- The extension will show a toast notification if you don't have permission to record
- Recording requires Google Workspace account with recording enabled by admin

## Troubleshooting

### Recording doesn't start automatically

1. Make sure you're the meeting organizer or have recording permissions
2. Check if recording is already active (look for "Recording" indicator)
3. Verify your Google Workspace account has recording enabled

### Extension not working

1. Refresh the page after installing the extension
2. Check the browser console for error messages
3. Make sure the extension is enabled in `chrome://extensions/`

## Development

### File Structure

```
meet-auto-record/
├── manifest.json          # Extension manifest (Manifest V3)
├── content-calendar.js    # Google Calendar content script
├── content-meet.js        # Google Meet content script
├── styles.css             # Toast and indicator styles
├── icons/
│   ├── icon.svg          # Source SVG icon
│   ├── generate-icons.html # Icon generator
│   ├── icon16.png        # 16x16 icon
│   ├── icon48.png        # 48x48 icon
│   └── icon128.png       # 128x128 icon
└── README.md             # This file
```

### Debug Mode

Open the browser console and access debug functions:

```javascript
// Show toast notification
window.__meetAutoRecord.showToast('info', 'Title', 'Message');

// Check if recording is active
window.__meetAutoRecord.isRecordingActive();

// Manually trigger auto-recording
window.__meetAutoRecord.startAutoRecording();
```

## License

MIT License
