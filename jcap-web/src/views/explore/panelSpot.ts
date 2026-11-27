import type { ExploreActivity, ExploreSpot } from '../../types/explore';
import { stampOf, type SpotStamp } from './learnProgress';
import { resumeOf } from './spotShadowingShared';
import type { SpotStepInput } from './spotStepState';

/** Một mốc như ngăn tỉnh cần: dữ liệu API kèm hoạt động và tình trạng để hiển thị */
export interface PanelSpot {
  /** Vị trí trong danh sách mốc của tỉnh (theo lộ trình), tính từ 0 */
  index: number;
  data: ExploreSpot;
  stamp: SpotStamp;
  shadowing?: ExploreActivity;
  roleplay?: ExploreActivity;
  step: SpotStepInput;
}

export function toPanelSpot(data: ExploreSpot, index: number): PanelSpot {
  const activities = data.lesson?.activities ?? [];
  const shadowing = activities.find((a) => a.type === 'Shadowing' && a.referenceId);
  const roleplay = activities.find((a) => a.type === 'Roleplay');
  const stamp = stampOf(data.progress);
  return {
    index,
    data,
    stamp,
    shadowing,
    roleplay,
    step: {
      stamp,
      hasLesson: !!data.lesson,
      hasShadowing: !!shadowing,
      hasRoleplay: !!roleplay?.scenarioId,
      resume: shadowing?.referenceId ? resumeOf(shadowing.referenceId) : null,
    },
  };
}
