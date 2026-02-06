// SPDX-License-Identifier: MIT
/**
 * BranchItem component for GitPanel
 */

interface BranchItemProps {
  branch: { name: string; isCurrent: boolean; ahead?: number; behind?: number; isRemote: boolean };
  onCheckout: () => void;
}

export function BranchItem({ branch, onCheckout }: BranchItemProps) {
  return (
    <div className="group flex items-center gap-2 px-2 py-1 rounded hover:bg-surface-700/50">
      {branch.isCurrent ? (
        <svg className="w-3 h-3 text-green-400" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      ) : (
        <div className="w-3 h-3" />
      )}
      <span className={`flex-1 text-xs truncate ${branch.isCurrent ? 'text-green-400 font-medium' : 'text-surface-200'}`}>
        {branch.name}
      </span>
      {!branch.isCurrent && !branch.isRemote && (
        <button
          onClick={onCheckout}
          className="hidden group-hover:block text-xs text-surface-400 hover:text-surface-200"
        >
          checkout
        </button>
      )}
    </div>
  );
}
