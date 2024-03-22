# Incoming call window

This library is intended to display popup when user receives incoming call. The popup content is a copy of the original 
popup displayed on the main app window.

## Known issues
- The popup won't show when main window is minimized. When the window in minimized the rendering process stops
processing UI changes. Because the popup is dependent on original popup it can't be rendered until the original
is shown.