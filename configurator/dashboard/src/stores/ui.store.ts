// SPDX-License-Identifier: MIT
/**
 * UI Store - Manages UI state, navigation, modals, and toasts
 *
 * This store handles global UI state:
 * - Current wizard step
 * - Current panel (wizard, manage, orchestrator, analytics)
 * - Modal visibility
 * - Toast notifications
 *
 * @example
 * ```tsx
 * const { currentStep, setStep, openModal, addToast } = useUIStore();
 * ```
 */

import { create, type StateCreator } from 'zustand';
import { devtools } from 'zustand/middleware';
import { config } from '@/config';

type Panel = 'wizard' | 'orchestrator' | 'code-review' | 'codegen' | 'usage' | 'live-performance';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

// Tool Window types - Right side (full height panels)
export type ToolWindowId = 'git' | 'manage' | 'analytics';

// Bottom Tool Window types - Bottom bar (quarter height panels)
export type BottomToolWindowId = 'terminal' | 'logs';

export interface ToolWindowState {
  /** Whether the tool window is open */
  isOpen: boolean;
  /** Width of the tool window panel in pixels */
  width: number;
}

export interface BottomToolWindowState {
  /** Whether the tool window is open */
  isOpen: boolean;
  /** Height of the tool window panel in pixels */
  height: number;
}

export interface Toast {
  /** Unique toast ID */
  id: string;
  /** Toast type */
  type: ToastType;
  /** Toast message */
  message: string;
  /** Optional title */
  title?: string;
  /** Duration in ms (0 = persistent) */
  duration?: number;
  /** Timestamp when added */
  timestamp: number;
}

interface UIState {
  // ============================================
  // STATE
  // ============================================

  /** Current wizard step (1-5) */
  currentStep: number;

  /** Current active panel */
  currentPanel: Panel;

  /** Server connection status */
  serverConnected: boolean;

  /** Modal visibility map */
  modals: Record<string, boolean>;

  /** Active toasts */
  toasts: Toast[];

  /** Sidebar collapsed state */
  sidebarCollapsed: boolean;

  /** Console size */
  consoleSize: 'small' | 'medium' | 'large' | 'fullscreen';

  /** Tool window states (right side) */
  toolWindows: Record<ToolWindowId, ToolWindowState>;

  /** Currently active tool window (if any is open) */
  activeToolWindow: ToolWindowId | null;

  /** Bottom tool window states */
  bottomToolWindows: Record<BottomToolWindowId, BottomToolWindowState>;

  /** Currently active bottom tool window (if any is open) */
  activeBottomToolWindow: BottomToolWindowId | null;

  // ============================================
  // ACTIONS
  // ============================================

  /** Set current wizard step */
  setStep: (step: number) => void;

  /** Go to next step */
  nextStep: () => void;

  /** Go to previous step */
  prevStep: () => void;

  /** Set current panel */
  setPanel: (panel: Panel) => void;

  /** Set server connection status */
  setServerConnected: (connected: boolean) => void;

  /** Open a modal */
  openModal: (modalId: string) => void;

  /** Close a modal */
  closeModal: (modalId: string) => void;

  /** Toggle modal visibility */
  toggleModal: (modalId: string) => void;

  /** Close all modals */
  closeAllModals: () => void;

  /** Add a toast notification */
  addToast: (toast: Omit<Toast, 'id' | 'timestamp'>) => string;

  /** Remove a toast by ID */
  removeToast: (id: string) => void;

  /** Clear all toasts */
  clearToasts: () => void;

  /** Toggle sidebar collapsed state */
  toggleSidebar: () => void;

  /** Set sidebar collapsed state */
  setSidebarCollapsed: (collapsed: boolean) => void;

  /** Set console size */
  setConsoleSize: (size: 'small' | 'medium' | 'large' | 'fullscreen') => void;

  /** Toggle a tool window */
  toggleToolWindow: (id: ToolWindowId) => void;

  /** Open a tool window */
  openToolWindow: (id: ToolWindowId) => void;

  /** Close a tool window */
  closeToolWindow: (id: ToolWindowId) => void;

  /** Close all tool windows */
  closeAllToolWindows: () => void;

  /** Set tool window width */
  setToolWindowWidth: (id: ToolWindowId, width: number) => void;

  /** Toggle a bottom tool window */
  toggleBottomToolWindow: (id: BottomToolWindowId) => void;

  /** Close all bottom tool windows */
  closeAllBottomToolWindows: () => void;

  /** Set bottom tool window height */
  setBottomToolWindowHeight: (id: BottomToolWindowId, height: number) => void;

  /** Reset UI state */
  reset: () => void;
}

const DEFAULT_TOOL_WINDOW_WIDTH = 350;
const DEFAULT_BOTTOM_TOOL_WINDOW_HEIGHT = 200;

const initialToolWindows: Record<ToolWindowId, ToolWindowState> = {
  git: { isOpen: false, width: DEFAULT_TOOL_WINDOW_WIDTH },
  manage: { isOpen: false, width: 400 },
  analytics: { isOpen: false, width: 400 },
};

const initialBottomToolWindows: Record<BottomToolWindowId, BottomToolWindowState> = {
  terminal: { isOpen: false, height: DEFAULT_BOTTOM_TOOL_WINDOW_HEIGHT },
  logs: { isOpen: false, height: DEFAULT_BOTTOM_TOOL_WINDOW_HEIGHT },
};

const initialState = {
  currentStep: 1,
  currentPanel: 'wizard' as Panel,
  serverConnected: false,
  modals: {},
  toasts: [],
  sidebarCollapsed: false,
  consoleSize: 'medium' as const,
  toolWindows: initialToolWindows,
  activeToolWindow: null as ToolWindowId | null,
  bottomToolWindows: initialBottomToolWindows,
  activeBottomToolWindow: null as BottomToolWindowId | null,
};

/**
 * Generate unique toast ID
 */
function generateToastId(): string {
  return `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * UI state management store
 */
const storeCreator: StateCreator<UIState, [['zustand/devtools', never]], []> = (set) => ({
  ...initialState,

  // ============================================
  // WIZARD STEPS
  // ============================================

      setStep: (step: number) =>
        set({ currentStep: Math.max(1, Math.min(5, step)) }, false, 'setStep'),

      nextStep: () =>
        set(
          (state) => ({
            currentStep: Math.min(5, state.currentStep + 1),
          }),
          false,
          'nextStep'
        ),

      prevStep: () =>
        set(
          (state) => ({
            currentStep: Math.max(1, state.currentStep - 1),
          }),
          false,
          'prevStep'
        ),

      // ============================================
      // PANELS
      // ============================================

      setPanel: (panel) =>
        set({ currentPanel: panel }, false, 'setPanel'),

      // ============================================
      // SERVER CONNECTION
      // ============================================

      setServerConnected: (connected) =>
        set({ serverConnected: connected }, false, 'setServerConnected'),

      // ============================================
      // MODALS
      // ============================================

      openModal: (modalId) =>
        set(
          (state) => ({
            modals: { ...state.modals, [modalId]: true },
          }),
          false,
          'openModal'
        ),

      closeModal: (modalId) =>
        set(
          (state) => ({
            modals: { ...state.modals, [modalId]: false },
          }),
          false,
          'closeModal'
        ),

      toggleModal: (modalId) =>
        set(
          (state) => ({
            modals: { ...state.modals, [modalId]: !state.modals[modalId] },
          }),
          false,
          'toggleModal'
        ),

      closeAllModals: () =>
        set(
          (state) => ({
            modals: Object.keys(state.modals).reduce(
              (acc, key) => ({ ...acc, [key]: false }),
              {}
            ),
          }),
          false,
          'closeAllModals'
        ),

      // ============================================
      // TOASTS
      // ============================================

      addToast: (toast) => {
        const id = generateToastId();
        const newToast: Toast = {
          ...toast,
          id,
          timestamp: Date.now(),
          duration: toast.duration ?? config.ui.toastDuration, // Default from config
        };

        set(
          (state) => ({
            toasts: [...state.toasts, newToast],
          }),
          false,
          'addToast'
        );

        // Auto-remove after duration (if not persistent)
        if (newToast.duration && newToast.duration > 0) {
          setTimeout(() => {
            set(
              (state) => ({
                toasts: state.toasts.filter((t) => t.id !== id),
              }),
              false,
              'autoRemoveToast'
            );
          }, newToast.duration);
        }

        return id;
      },

      removeToast: (id) =>
        set(
          (state) => ({
            toasts: state.toasts.filter((t) => t.id !== id),
          }),
          false,
          'removeToast'
        ),

      clearToasts: () =>
        set({ toasts: [] }, false, 'clearToasts'),

      // ============================================
      // SIDEBAR
      // ============================================

      toggleSidebar: () =>
        set(
          (state) => ({
            sidebarCollapsed: !state.sidebarCollapsed,
          }),
          false,
          'toggleSidebar'
        ),

      setSidebarCollapsed: (collapsed) =>
        set({ sidebarCollapsed: collapsed }, false, 'setSidebarCollapsed'),

      // ============================================
      // CONSOLE
      // ============================================

      setConsoleSize: (size) =>
        set({ consoleSize: size }, false, 'setConsoleSize'),

      // ============================================
      // TOOL WINDOWS
      // ============================================

      toggleToolWindow: (id) =>
        set(
          (state) => {
            const isCurrentlyOpen = state.toolWindows[id].isOpen;
            if (isCurrentlyOpen) {
              // Closing this tool window
              return {
                toolWindows: {
                  ...state.toolWindows,
                  [id]: { ...state.toolWindows[id], isOpen: false },
                },
                activeToolWindow: state.activeToolWindow === id ? null : state.activeToolWindow,
              };
            } else {
              // Opening this tool window, close others
              const newToolWindows = { ...state.toolWindows };
              for (const key of Object.keys(newToolWindows) as ToolWindowId[]) {
                newToolWindows[key] = {
                  ...newToolWindows[key],
                  isOpen: key === id,
                };
              }
              return {
                toolWindows: newToolWindows,
                activeToolWindow: id,
              };
            }
          },
          false,
          'toggleToolWindow'
        ),

      openToolWindow: (id) =>
        set(
          (state) => {
            // Close all others, open this one
            const newToolWindows = { ...state.toolWindows };
            for (const key of Object.keys(newToolWindows) as ToolWindowId[]) {
              newToolWindows[key] = {
                ...newToolWindows[key],
                isOpen: key === id,
              };
            }
            return {
              toolWindows: newToolWindows,
              activeToolWindow: id,
            };
          },
          false,
          'openToolWindow'
        ),

      closeToolWindow: (id) =>
        set(
          (state) => ({
            toolWindows: {
              ...state.toolWindows,
              [id]: { ...state.toolWindows[id], isOpen: false },
            },
            activeToolWindow: state.activeToolWindow === id ? null : state.activeToolWindow,
          }),
          false,
          'closeToolWindow'
        ),

      closeAllToolWindows: () =>
        set(
          (state) => {
            const newToolWindows = { ...state.toolWindows };
            for (const key of Object.keys(newToolWindows) as ToolWindowId[]) {
              newToolWindows[key] = { ...newToolWindows[key], isOpen: false };
            }
            return {
              toolWindows: newToolWindows,
              activeToolWindow: null,
            };
          },
          false,
          'closeAllToolWindows'
        ),

      setToolWindowWidth: (id, width) =>
        set(
          (state) => ({
            toolWindows: {
              ...state.toolWindows,
              [id]: { ...state.toolWindows[id], width: Math.max(200, Math.min(800, width)) },
            },
          }),
          false,
          'setToolWindowWidth'
        ),

      // ============================================
      // BOTTOM TOOL WINDOWS
      // ============================================

      toggleBottomToolWindow: (id) =>
        set(
          (state) => {
            const isCurrentlyOpen = state.bottomToolWindows[id].isOpen;
            if (isCurrentlyOpen) {
              // Closing this tool window
              return {
                bottomToolWindows: {
                  ...state.bottomToolWindows,
                  [id]: { ...state.bottomToolWindows[id], isOpen: false },
                },
                activeBottomToolWindow: state.activeBottomToolWindow === id ? null : state.activeBottomToolWindow,
              };
            } else {
              // Opening this tool window, close others
              const newBottomToolWindows = { ...state.bottomToolWindows };
              for (const key of Object.keys(newBottomToolWindows) as BottomToolWindowId[]) {
                newBottomToolWindows[key] = {
                  ...newBottomToolWindows[key],
                  isOpen: key === id,
                };
              }
              return {
                bottomToolWindows: newBottomToolWindows,
                activeBottomToolWindow: id,
              };
            }
          },
          false,
          'toggleBottomToolWindow'
        ),

      closeAllBottomToolWindows: () =>
        set(
          (state) => {
            const newBottomToolWindows = { ...state.bottomToolWindows };
            for (const key of Object.keys(newBottomToolWindows) as BottomToolWindowId[]) {
              newBottomToolWindows[key] = { ...newBottomToolWindows[key], isOpen: false };
            }
            return {
              bottomToolWindows: newBottomToolWindows,
              activeBottomToolWindow: null,
            };
          },
          false,
          'closeAllBottomToolWindows'
        ),

      setBottomToolWindowHeight: (id, height) =>
        set(
          (state) => ({
            bottomToolWindows: {
              ...state.bottomToolWindows,
              [id]: { ...state.bottomToolWindows[id], height: Math.max(100, Math.min(400, height)) },
            },
          }),
          false,
          'setBottomToolWindowHeight'
        ),

      // ============================================
      // RESET
      // ============================================

      reset: () =>
        set(initialState, false, 'reset'),
});

export const useUIStore = create<UIState>()(
  devtools(storeCreator, { name: 'UIStore' })
);
