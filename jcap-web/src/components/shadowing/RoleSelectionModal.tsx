import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

interface RoleSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  dialogueId: number;
  dialogueTitle: string;
  roleAName: string;
  roleBName: string;
  onConfirm: (selectedRole: 'A' | 'B') => void;
}

export const RoleSelectionModal: React.FC<RoleSelectionModalProps> = ({
  isOpen,
  onClose,
  dialogueTitle,
  roleAName,
  roleBName,
  onConfirm,
}) => {
  const [selectedRole, setSelectedRole] = useState<'A' | 'B'>('A');

  const handleStart = () => {
    onConfirm(selectedRole);
  };

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
                  <img src="/default_avatar.png" alt={roleAName} className="w-full h-full object-cover" />
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
                  <img src="/default_avatar.png" alt={roleBName} className="w-full h-full object-cover" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};
