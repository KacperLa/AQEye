import React from 'react';
import { Pressable, Platform } from 'react-native';

// List of React Native responder events that are not supported on web
const UNSUPPORTED_WEB_PROPS = [
  'onResponderGrant',
  'onResponderMove',
  'onResponderRelease',
  'onResponderReject',
  'onResponderStart',
  'onResponderEnd',
  'onResponderTerminate',
  'onResponderTerminationRequest',
  'onStartShouldSetResponder',
  'onStartShouldSetResponderCapture',
  'onMoveShouldSetResponder',
  'onMoveShouldSetResponderCapture',
  'onSelectionChangeShouldSetResponder',
  'onSelectionChangeShouldSetResponderCapture',
];

const WebCompatiblePressable = ({ children, ...props }) => {
  // Filter out unsupported props on web
  const filteredProps = Platform.OS === 'web' 
    ? Object.keys(props).reduce((acc, key) => {
        if (!UNSUPPORTED_WEB_PROPS.includes(key)) {
          acc[key] = props[key];
        }
        return acc;
      }, {})
    : props;

  return (
    <Pressable {...filteredProps}>
      {children}
    </Pressable>
  );
};

export default WebCompatiblePressable;
