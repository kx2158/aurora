<template>
    <TooltipProvider>
        <MacOSTitleBar></MacOSTitleBar>

        <div
            id="x-app"
            class="flex w-screen h-screen overflow-hidden cursor-default [&>.x-container]:pt-[15px]"
            :class="{ 'pt-7': isMacOS }">
            <RouterView></RouterView>
            <Toaster position="top-center" :theme="theme"></Toaster>

            <AlertDialogModal></AlertDialogModal>
            <OpenExternalLinkDialog></OpenExternalLinkDialog>
            <PromptDialogModal></PromptDialogModal>
            <OtpDialogModal></OtpDialogModal>
            <DatabaseUpgradeDialog></DatabaseUpgradeDialog>

            <VRCXUpdateDialog></VRCXUpdateDialog>
            <NeonDock></NeonDock>
            <AuroraCompanion></AuroraCompanion>
            <AuroraLockScreen></AuroraLockScreen>
        </div>
        <div id="x-dialog-portal" class="x-dialog-portal"></div>
    </TooltipProvider>
</template>

<script setup>
    import { computed, onBeforeMount, onMounted } from 'vue';

    import { addGameLogEvent, getGameLogTable } from './coordinators/gameLogCoordinator';
    import {
        runCheckVRChatDebugLoggingFlow,
        runUpdateIsGameRunningFlow,
        runUpdateIsHmdAfkFlow
    } from './coordinators/gameCoordinator';
    import { Toaster } from './components/ui/sonner';
    import { TooltipProvider } from './components/ui/tooltip';
    import { createGlobalStores } from './stores';
    import { initNoty } from './plugins/noty';
    import { initChatbox } from './services/auroraChatbox';
    import { initAccent } from './services/auroraAccent';
import { initAlarms } from './services/auroraAlarms';
import { initVrBridge, neonCommand } from './services/auroraVrBridge';
import { initIntegrations } from './services/auroraIntegrations';

    import NeonDock from './components/NeonDock.vue';
    import AuroraCompanion from './components/AuroraCompanion.vue';
    import AuroraLockScreen from './components/AuroraLockScreen.vue';
    import AlertDialogModal from './components/ui/alert-dialog/AlertDialogModal.vue';
    import DatabaseUpgradeDialog from './components/dialogs/DatabaseUpgradeDialog.vue';
    import MacOSTitleBar from './components/MacOSTitleBar.vue';
    import OpenExternalLinkDialog from './components/dialogs/OpenExternalLinkDialog.vue';
    import OtpDialogModal from './components/ui/dialog/OtpDialogModal.vue';
    import PromptDialogModal from './components/ui/dialog/PromptDialogModal.vue';
    import VRCXUpdateDialog from './components/dialogs/VRCXUpdateDialog.vue';

    import '@/styles/globals.css';

    console.log(`isLinux: ${LINUX}`);

    const isMacOS = computed(() => navigator.platform.includes('Mac'));

    const theme = computed(() => {
        return store.appearanceSettings.isDarkMode ? 'dark' : 'light';
    });

    initNoty();
    initChatbox();
    initIntegrations();
    initAccent();
    initAlarms();
    initVrBridge();

    const store = createGlobalStores();

    if (typeof window !== 'undefined') {
        window.$pinia = store;
        window.$bridge = {
            updateIsGameRunning: runUpdateIsGameRunningFlow,
            updateIsHmdAfk: runUpdateIsHmdAfkFlow,
            neonCommand,
            addGameLogEvent
        };
    }

    onBeforeMount(() => {
        store.updateLoop.updateLoop();
    });

    onMounted(async () => {
        if (await store.vrcx.waitForDatabaseInit()) {
            getGameLogTable();
            await store.auth.migrateStoredUsers();
            store.auth.autoLoginAfterMounted();
            store.vrcx.checkAutoBackupRestoreVrcRegistry();
        }

        runCheckVRChatDebugLoggingFlow();
    });
</script>
