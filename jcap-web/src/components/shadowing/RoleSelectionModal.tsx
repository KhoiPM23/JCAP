import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { DefaultAvatarImage } from './DefaultAvatarImage';
import { PracticePanel } from '../jcap/PracticePanel';
import { Button as JcapButton, Icon, IconButton } from '../jcap';
import { usePhoneViewport } from '../../hooks/usePhoneViewport';

interface RoleSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  dialogueId: number;
  dialogueTitle: string;
  roleAName: string;
  roleBName: string;
  currentRole?: 'A' | 'B';
  onConfirm: (selectedRole: 'A' | 'B') => void;
}

export const RoleSelectionModal: React.FC<RoleSelectionModalProps> = ({
  isOpen,
  onClose,
  dialogueTitle,
  roleAName,
  roleBName,
  currentRole,
  onConfirm,
}) => {
  const [selectedRole, setSelectedRole] = useState<'A' | 'B'>('A');
  const [mobileChoice, setMobileChoice] = useState<'A' | 'B' | null>(null);
  const mobile = usePhoneViewport();

  const handleStart = () => {
    onConfirm(selectedRole);
  };

  if (mobile) {
    const roles = [{ id: 'A', name: roleAName }, { id: 'B', name: roleBName }] as const;
    const chosenRole = mobileChoice ?? currentRole ?? 'A';
    const willChangeRole = currentRole !== undefined && chosenRole !== currentRole;
    const dismiss = () => {
      setMobileChoice(null);
      onClose();
    };

    return (
      <PracticePanel mobile open={isOpen} label="Chọn vai luyện nói" onDismiss={dismiss}>
        <div className="px-4 pb-4 pt-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold">Chọn vai luyện nói</h2>
            <IconButton icon="close" label="Đóng chọn vai" className="min-h-11 min-w-11" onClick={dismiss} />
          </div>
          <p className="mb-4 break-words text-sm text-sumi-muted">{dialogueTitle}</p>
          <div role="group" aria-label="Vai trong bài hội thoại" className="grid gap-2">
            {roles.map(({ id, name }) => {
              const selected = chosenRole === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setMobileChoice(id)}
                  className={`flex min-h-16 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left ${selected ? 'border-ai bg-ai-soft' : 'border-line bg-paper-50'}`}
                >
                  <span className="size-10 shrink-0 overflow-hidden rounded-full bg-paper-200">
                    <DefaultAvatarImage alt="" className="size-full object-cover" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium text-sumi-muted">Vai {id}</span>
                    <span className="block break-words text-sm font-bold">{name}</span>
                  </span>
                  {selected && <Icon name="check_circle" size={22} className="shrink-0 text-ai" />}
                </button>
              );
            })}
          </div>
          {willChangeRole && <p role="status" className="mt-3 text-sm text-warning">Đổi vai sẽ bắt đầu bài luyện từ đầu.</p>}
          <JcapButton variant="primary" size="lg" block className="mt-4" onClick={() => {
            if (currentRole === chosenRole) dismiss();
            else {
              setMobileChoice(null);
              onConfirm(chosenRole);
            }
          }}>
            {willChangeRole ? 'Đổi vai và luyện lại' : currentRole ? 'Giữ vai hiện tại' : 'Bắt đầu luyện'}
          </JcapButton>
        </div>
      </PracticePanel>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Chọn vai bạn muốn luyện nói"
      maxWidth="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Hủy bỏ
          </Button>
          <Button variant="primary" onClick={handleStart}>
            Bắt đầu Luyện tập ngay
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="bg-[#F8FAFD] p-3 rounded-xl border border-[#E6EDF5]">
          <p className="text-xs text-[#71809A]">
            Bài hội thoại: <strong className="text-[#071A44]">{dialogueTitle}</strong>
          </p>
        </div>
        <p className="text-xs sm:text-sm text-[#4A5D78] leading-relaxed">
          Hãy chọn một nhân vật để đóng vai.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          {/* Card Role A */}
          <div
            onClick={() => setSelectedRole('A')}
            className={`cursor-pointer rounded-2xl p-4 border-2 transition-all flex flex-col justify-between ${
              selectedRole === 'A'
                ? 'border-[#0878EE] bg-blue-50/60 shadow-xs'
                : 'border-[#E6EDF5] bg-white hover:border-[#BCDDFB]'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                  selectedRole === 'A' ? 'bg-[#0878EE] text-white' : 'bg-blue-100 text-[#0878EE]'
                }`}>
                  Vai A
                </span>
                {selectedRole === 'A' ? (
                  <div className="w-5 h-5 rounded-full bg-[#0878EE] text-white flex items-center justify-center text-xs font-bold shadow-xs">
                    ✓
                  </div>
                ) : (
                  <div className="w-5 h-5 rounded-full border border-gray-300" />
                )}
              </div>
              <div className="flex items-center justify-between gap-3 pt-1">
                <h4 className="font-bold text-sm sm:text-base text-[#071A44] leading-snug flex-1">
                  {roleAName}
                </h4>
                <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-white shadow-sm bg-blue-100 flex-shrink-0">
                  <DefaultAvatarImage alt={roleAName} className="w-full h-full object-cover" />
                </div>
              </div>
            </div>
          </div>

          {/* Card Role B */}
          <div
            onClick={() => setSelectedRole('B')}
            className={`cursor-pointer rounded-2xl p-4 border-2 transition-all flex flex-col justify-between ${
              selectedRole === 'B'
                ? 'border-[#0878EE] bg-purple-50/60 shadow-xs'
                : 'border-[#E6EDF5] bg-white hover:border-[#BCDDFB]'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                  selectedRole === 'B' ? 'bg-purple-600 text-white' : 'bg-purple-100 text-purple-700'
                }`}>
                  Vai B
                </span>
                {selectedRole === 'B' ? (
                  <div className="w-5 h-5 rounded-full bg-[#0878EE] text-white flex items-center justify-center text-xs font-bold shadow-xs">
                    ✓
                  </div>
                ) : (
                  <div className="w-5 h-5 rounded-full border border-gray-300" />
                )}
              </div>
              <div className="flex items-center justify-between gap-3 pt-1">
                <h4 className="font-bold text-sm sm:text-base text-[#071A44] leading-snug flex-1">
                  {roleBName}
                </h4>
                <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-white shadow-sm bg-purple-100 flex-shrink-0">
                  <DefaultAvatarImage alt={roleBName} className="w-full h-full object-cover" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};
