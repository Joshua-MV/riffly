import type { PressableStateCallbackType } from 'react-native';

/** react-native-web adds `hovered` to the Pressable state; native never sets it. */
export type PressState = PressableStateCallbackType & { hovered?: boolean };
