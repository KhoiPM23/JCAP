import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', label, error, helperText, id, ...props }, ref) => {
    // Generate a unique ID if one isn't provided but we have a label
    const inputId = id || (label ? `input-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined);

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-[#071A44]">
            {label}
          </label>
        )}
        
        <input
          id={inputId}
          ref={ref}
          className={`
            block w-full rounded-lg border px-3 py-2 text-[#071A44] 
            focus:outline-none focus:ring-2 focus:ring-offset-0 transition-colors
            disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed
            ${error 
              ? 'border-[#D92D20] focus:border-[#D92D20] focus:ring-[#D92D20]/20' 
              : 'border-[#E6EDF5] focus:border-[#0878EE] focus:ring-[#0878EE]/20 hover:border-gray-300'
            }
            ${className}
          `}
          {...props}
        />
        
        {(error || helperText) && (
          <p className={`text-sm ${error ? 'text-[#D92D20]' : 'text-[#71809A]'}`}>
            {error || helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
