import {Config} from '@remotion/cli/config';

Config.setEntryPoint('./src/index.ts');
Config.setPixelFormat('yuv420p');
Config.setColorSpace('bt709');
Config.setMuted(true);
Config.setOverwriteOutput(true);
