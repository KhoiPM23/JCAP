import type { ApiResponse } from '../types/auth';
import type {
  ShadowingDialogueItem,
  ShadowingDialogueDetail,
  ShadowingFilterParams,
  ShadowingSessionCompletePayload,
  ShadowingSessionCompleteResult,
  ShadowingPracticeSessionRecord,
  ShadowingAudioEvaluationResult,
} from '../types/shadowing';

import type { ClientRecognitionSnapshot } from '../utils/speechTranscriptCollector';
import { fileExtensionForMime } from '../utils/recordingMime';

export interface ShadowingEvaluateAudioEvidence {
  /** Câu đang luyện: backend lấy câu mẫu từ CSDL và lưu kết quả chấm để đưa vào lịch sử. */
  sentenceId?: number;
  clientRecognition?: ClientRecognitionSnapshot;
  audioGateStatus?: 'good' | 'acceptable' | 'needs_retry' | 'unmeasured';
  audioGateDetail?: string;
  durationMs?: number;
  /** Bản ghi đã xuất WAV PCM 16-bit mono 16 kHz để backend đo nhịp nói (tùy chọn). */
  analysisWav?: Blob | null;
  /** Giọng VOICEVOX người học đã nghe làm mẫu, để backend so nhịp nói với đúng giọng đó. */
  referenceSpeakerId?: number | null;
}

class ShadowingService {
  private getHeaders(): HeadersInit {
    const token = localStorage.getItem('jcap_token');
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  /**
   * UC-25 & UC-26: Lấy danh mục bài học Shadowing thực tế từ Backend Database
   * Đồng bộ 100% với các bài do Admin tạo từ trang quản trị.
   */
  public async getCatalog(params?: ShadowingFilterParams): Promise<ApiResponse<ShadowingDialogueItem[]>> {
    try {
      const searchParams = new URLSearchParams();
      if (params?.keyword) searchParams.append('keyword', params.keyword);
      if (params?.jlptLevel && params.jlptLevel !== 'ALL') searchParams.append('jlptLevel', params.jlptLevel);
      if (params?.scenarioId) searchParams.append('scenarioId', params.scenarioId.toString());

      const url = `/api/shadowing${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => null);
        return {
          success: false,
          message: err?.message || `Lỗi tải danh mục bài học (${response.status}).`,
          data: [],
        };
      }

      return await response.json();
    } catch {
      return {
        success: false,
        message: 'Không thể kết nối đến máy chủ backend.',
        data: [],
      };
    }
  }

  /**
   * UC-27: Lấy chi tiết bài học Shadowing kèm danh sách câu thoại thực tế từ Database
   */
  public async getDetail(id: number): Promise<ApiResponse<ShadowingDialogueDetail>> {
    try {
      const response = await fetch(`/api/shadowing/${id}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => null);
        return {
          success: false,
          message: err?.message || `Không tìm thấy bài học Shadowing với Id = ${id}.`,
        };
      }

      return await response.json();
    } catch {
      return {
        success: false,
        message: 'Không thể kết nối đến máy chủ backend để lấy bài học.',
      };
    }
  }

  /**
   * Lưu lại tiến trình hoàn thành buổi luyện tập
   */
  public async completeSession(payload: ShadowingSessionCompletePayload): Promise<ApiResponse<ShadowingSessionCompleteResult>> {
    try {
      const response = await fetch('/api/shadowing/session/complete', {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        return await response.json();
      }
      const err = await response.json().catch(() => null);
      return {
        success: false,
        message: err?.message || 'Không thể lưu kết quả buổi luyện tập.',
      };
    } catch {
      return {
        success: false,
        message: 'Không thể kết nối máy chủ để lưu kết quả buổi luyện tập.',
      };
    }
  }

  /** Lịch sử các buổi luyện đã hoàn thành của người dùng (lưu ở backend, mới nhất trước). */
  public async getHistory(): Promise<ApiResponse<ShadowingPracticeSessionRecord[]>> {
    try {
      const response = await fetch('/api/shadowing/history', { headers: this.getHeaders() });
      if (response.ok) {
        return await response.json();
      }
      const err = await response.json().catch(() => null);
      return { success: false, message: err?.message || 'Không thể tải lịch sử luyện tập.' };
    } catch {
      return { success: false, message: 'Không thể kết nối máy chủ để tải lịch sử luyện tập.' };
    }
  }

  public async evaluateAudio(
    audioBlob: Blob,
    targetText: string,
    evidence: ShadowingEvaluateAudioEvidence = {},
  ): Promise<ApiResponse<ShadowingAudioEvaluationResult>> {
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, `recording.${fileExtensionForMime(audioBlob.type)}`);
      formData.append('targetText', targetText);
      if (evidence.sentenceId != null) formData.append('sentenceId', String(evidence.sentenceId));

      const rec = evidence.clientRecognition;
      if (rec) {
        formData.append('clientRecognitionStatus', rec.status);
        // Chỉ gửi transcript khi đã chốt; không bao giờ gửi interim.
        if (rec.status === 'final' && rec.transcript) formData.append('clientTranscript', rec.transcript);
        if (rec.error) formData.append('clientRecognitionError', rec.error);
      }
      if (evidence.audioGateStatus) formData.append('audioGateStatus', evidence.audioGateStatus);
      if (evidence.audioGateDetail) formData.append('audioGateDetail', evidence.audioGateDetail);
      if (evidence.durationMs != null) formData.append('durationMs', String(Math.round(evidence.durationMs)));
      if (evidence.analysisWav) formData.append('analysisWav', evidence.analysisWav, 'analysis.wav');
      if (evidence.referenceSpeakerId != null) formData.append('referenceSpeakerId', String(evidence.referenceSpeakerId));

      const token = localStorage.getItem('jcap_token');
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch('/api/shadowing/evaluate-audio', {
        method: 'POST',
        headers,
        body: formData,
      });

      if (response.status === 401) {
        return { success: false, message: 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại để tiếp tục chấm điểm.' };
      }
      if (response.status === 429) {
        return { success: false, message: 'Bạn thao tác quá nhanh. Hãy chờ vài giây rồi thử lại.' };
      }
      if (!response.ok) {
        return { success: false, message: 'Lỗi máy chủ khi đánh giá âm thanh. Điểm chưa được ghi nhận.' };
      }

      return await response.json();
    } catch {
      return {
        success: false,
        message: 'Không thể kết nối tới máy chủ. Điểm chưa được ghi nhận.',
      };
    }
  }

}

export const shadowingService = new ShadowingService();

