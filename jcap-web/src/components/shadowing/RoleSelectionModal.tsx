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
      maxWidth="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Hủy bỏ
          </Button>
          <Button variant="primary" onClick={handleStart}>
            Bắt đầu Luyện tập ngay ➔
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-xs text-[#71809A]">
          Bài hội thoại: <strong className="text-[#071A44]">{dialogueTitle}</strong>
        </p>
        <p className="text-sm text-[#071A44]">
          Hãy chọn một nhân vật để đóng vai. Hệ thống AI sẽ đọc lời thoại của nhân vật còn lại để bạn luyện Shadowing theo nhịp điệu tự nhiên.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          {/* Card Role A */}
          <div
            onClick={() => setSelectedRole('A')}
            className={`cursor-pointer rounded-xl p-4 border-2 transition-all flex flex-col justify-between ${
              selectedRole === 'A'
                ? 'border-[#0878EE] bg-blue-50/50 shadow-sm'
                : 'border-[#E6EDF5] bg-white hover:border-gray-300'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-[#0878EE]">
                  Vai A
                </span>
                {selectedRole === 'A' && (
                  <span className="text-xs text-[#0878EE] font-bold">✓ Đã chọn</span>
                )}
              </div>
              <h4 className="font-semibold text-base text-[#071A44] mb-1">
                {roleAName}
              </h4>
              <p className="text-xs text-[#71809A]">
                Bạn sẽ đọc các câu thoại của nhân vật này.
              </p>
            </div>
          </div>

          {/* Card Role B */}
          <div
            onClick={() => setSelectedRole('B')}
            className={`cursor-pointer rounded-xl p-4 border-2 transition-all flex flex-col justify-between ${
              selectedRole === 'B'
                ? 'border-[#0878EE] bg-blue-50/50 shadow-sm'
                : 'border-[#E6EDF5] bg-white hover:border-gray-300'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                  Vai B
                </span>
                {selectedRole === 'B' && (
                  <span className="text-xs text-[#0878EE] font-bold">✓ Đã chọn</span>
                )}
              </div>
              <h4 className="font-semibold text-base text-[#071A44] mb-1">
                {roleBName}
              </h4>
              <p className="text-xs text-[#71809A]">
                Bạn sẽ đọc các câu thoại của nhân vật này.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};
