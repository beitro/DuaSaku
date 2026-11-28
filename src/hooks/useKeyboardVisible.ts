import { useEffect, useState } from 'react';
import { Keyboard, type KeyboardEvent } from 'react-native';

export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      'keyboardDidShow',
      (event: KeyboardEvent) => setHeight(event.endCoordinates.height)
    );
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return height;
}

export function useKeyboardVisible(): boolean {
  return useKeyboardHeight() > 0;
}
