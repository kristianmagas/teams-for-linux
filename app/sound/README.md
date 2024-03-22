# Sound

This directory contains classes used for playing audio. It is used for playing notification sounds and for playing 
ringtone sound when `secondRingDevice` is set.

Note:
This library is originally create by [jijojosephk](https://github.com/jijojosephk) and can be found in 
[this repo](https://github.com/jijojosephk/node-sound). As the original project seams inactive, I decided to move 
the files to this project and make changes to allow device selection and loop playback. If this is wrong it should
be easy to implement the changes in the original project.

## Known issues
- Selecting output device is not tested on Mac and might not work.