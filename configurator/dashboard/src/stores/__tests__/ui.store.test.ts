// SPDX-License-Identifier: MIT
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useUIStore } from '../ui.store';

describe('UIStore', () => {
  beforeEach(() => {
    useUIStore.getState().reset();
    vi.clearAllTimers();
  });

  it('should set wizard step within bounds', () => {
    const { setStep } = useUIStore.getState();

    setStep(3);
    expect(useUIStore.getState().currentStep).toBe(3);

    setStep(0); // Below min
    expect(useUIStore.getState().currentStep).toBe(1);

    setStep(10); // Above max
    expect(useUIStore.getState().currentStep).toBe(5);
  });

  it('should navigate steps', () => {
    const { setStep, nextStep, prevStep } = useUIStore.getState();

    setStep(3);
    nextStep();
    expect(useUIStore.getState().currentStep).toBe(4);

    prevStep();
    prevStep();
    expect(useUIStore.getState().currentStep).toBe(2);

    // Can't go below 1
    setStep(1);
    prevStep();
    expect(useUIStore.getState().currentStep).toBe(1);

    // Can't go above 5
    setStep(5);
    nextStep();
    expect(useUIStore.getState().currentStep).toBe(5);
  });

  it('should switch panels', () => {
    const { setPanel } = useUIStore.getState();

    setPanel('orchestrator');
    expect(useUIStore.getState().currentPanel).toBe('orchestrator');

    setPanel('code-review');
    expect(useUIStore.getState().currentPanel).toBe('code-review');
  });

  it('should manage modals', () => {
    const { openModal, closeModal, toggleModal, closeAllModals } = useUIStore.getState();

    openModal('settings');
    expect(useUIStore.getState().modals['settings']).toBe(true);

    closeModal('settings');
    expect(useUIStore.getState().modals['settings']).toBe(false);

    toggleModal('confirm');
    expect(useUIStore.getState().modals['confirm']).toBe(true);

    toggleModal('confirm');
    expect(useUIStore.getState().modals['confirm']).toBe(false);

    openModal('modal1');
    openModal('modal2');
    closeAllModals();

    expect(useUIStore.getState().modals['modal1']).toBe(false);
    expect(useUIStore.getState().modals['modal2']).toBe(false);
  });

  it('should add and remove toasts', () => {
    const { addToast, removeToast } = useUIStore.getState();

    const id = addToast({ type: 'success', message: 'Test' });

    expect(useUIStore.getState().toasts).toHaveLength(1);
    expect(useUIStore.getState().toasts[0]?.id).toBe(id);

    removeToast(id);
    expect(useUIStore.getState().toasts).toHaveLength(0);
  });

  it('should clear all toasts', () => {
    const { addToast, clearToasts } = useUIStore.getState();

    addToast({ type: 'success', message: 'Test 1' });
    addToast({ type: 'error', message: 'Test 2' });

    expect(useUIStore.getState().toasts).toHaveLength(2);

    clearToasts();
    expect(useUIStore.getState().toasts).toHaveLength(0);
  });

  it('should toggle sidebar', () => {
    const { toggleSidebar, setSidebarCollapsed } = useUIStore.getState();

    expect(useUIStore.getState().sidebarCollapsed).toBe(false);

    toggleSidebar();
    expect(useUIStore.getState().sidebarCollapsed).toBe(true);

    setSidebarCollapsed(false);
    expect(useUIStore.getState().sidebarCollapsed).toBe(false);
  });

  it('should set console size', () => {
    const { setConsoleSize } = useUIStore.getState();

    setConsoleSize('large');
    expect(useUIStore.getState().consoleSize).toBe('large');

    setConsoleSize('fullscreen');
    expect(useUIStore.getState().consoleSize).toBe('fullscreen');
  });

  it('should reset to initial state', () => {
    const store = useUIStore.getState();

    store.setStep(3);
    store.setPanel('orchestrator');
    store.addToast({ type: 'info', message: 'Test' });

    store.reset();

    const state = useUIStore.getState();
    expect(state.currentStep).toBe(1);
    expect(state.currentPanel).toBe('wizard');
    expect(state.toasts).toEqual([]);
  });
});
