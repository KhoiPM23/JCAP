import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { shadowingStorageService } from '../services/shadowingStorageService';
import type { ShadowingProgress } from '../types/shadowingProgress';
import { ContinueShadowingCard } from '../components/shadowing/ContinueShadowingCard';
import { LearnerIntelligenceRadarCard } from '../components/roleplay/LearnerIntelligenceRadarCard';

export const LearnerDashboardView: React.FC = () => {
  const { user } = useAuth();

  const learnerId = user?.id || user?.email || 'guest_learner';
  const [latestInProgress, setLatestInProgress] = useState<ShadowingProgress | null>(null);

  const loadData = () => {
    const latest = shadowingStorageService.getLatestInProgress(learnerId);
    setLatestInProgress(latest);
  };

  useEffect(() => {
    loadData();
    const handleFocus = () => loadData();
    window.addEventListener('focus', handleFocus);
    window.addEventListener('storage', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('storage', handleFocus);
    };
  }, [learnerId]);

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12">
      {/* 1. Main Hero Resume Section: "Tiếp tục học Shadowing" */}
      <ContinueShadowingCard progress={latestInProgress} showEmptyState={true} />

      {/* 2. AI Roleplay Intelligence & Behavioral Radar Card (FE-03 Habit Loop) */}
      <section className="space-y-3">
        <LearnerIntelligenceRadarCard />
      </section>
    </div>
  );
};
