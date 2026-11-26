import React from 'react';
import { SupportDesk } from '../components/support/SupportDesk';
import { useTheme } from '../contexts/ThemeContext';

/** Trung tâm Hỗ trợ & Góp ý của học viên (/feedback) */
export const LearnerFeedbackView: React.FC = () => {
  const { isDark } = useTheme();
  return <SupportDesk viewer="learner" theme={isDark ? 'hoc-tap-dem' : 'kham-pha'} />;
};
