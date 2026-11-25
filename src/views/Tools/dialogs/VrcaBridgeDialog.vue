<template>
    <Dialog :open="isVrcaBridgeDialogVisible" @update:open="(open) => !open && closeDialog()">
        <DialogContent class="max-w-xl">
            <DialogHeader>
                <DialogTitle>{{ t('dialog.vrca_bridge.header') }}</DialogTitle>
                <DialogDescription>
                    {{ t('dialog.vrca_bridge.description') }}
                </DialogDescription>
            </DialogHeader>

            <div class="mt-4 space-y-4">
                <!-- File Selection -->
                <div>
                    <label class="text-sm font-medium mb-1 block">
                        {{ t('dialog.vrca_bridge.file_label') }}
                    </label>
                    <div class="flex items-center gap-2">
                        <Button variant="outline" class="flex-1 justify-start" @click="browseFile">
                            <i class="ri-file-3-line mr-2" />
                            <span class="truncate">{{ selectedFileName || t('dialog.vrca_bridge.browse') }}</span>
                        </Button>
                        <Button v-if="selectedFilePath" variant="ghost" size="icon-xs" @click="clearFile">
                            <i class="ri-close-line" />
                        </Button>
                    </div>
                </div>

                <!-- Platform Selection -->
                <div>
                    <label class="text-sm font-medium mb-1 block">
                        {{ t('dialog.vrca_bridge.platforms') }}
                    </label>
                    <div class="flex gap-4">
                        <label class="flex items-center gap-2 text-sm">
                            <input type="checkbox" v-model="buildPC" class="accent-primary" disabled checked />
                            {{ t('dialog.vrca_bridge.platform_pc') }}
                        </label>
                        <label class="flex items-center gap-2 text-sm">
                            <input type="checkbox" v-model="buildQuest" class="accent-primary" />
                            {{ t('dialog.vrca_bridge.platform_quest') }}
                        </label>
                    </div>
                </div>

                <!-- Unity Path -->
                <div>
                    <label class="text-sm font-medium mb-1 block">
                        {{ t('dialog.vrca_bridge.unity_path') }}
                    </label>
                    <div class="flex items-center gap-2">
                        <input
                            v-model="unityEditorPath"
                            type="text"
                            class="a-input flex-1 text-sm"
                            :placeholder="t('dialog.vrca_bridge.unity_path_placeholder')" />
                        <Button variant="outline" size="sm" @click="browseUnityPath">
                            <i class="ri-folder-open-line" />
                        </Button>
                    </div>
                    <p class="text-xs text-muted-foreground mt-1">
                        {{ t('dialog.vrca_bridge.unity_path_hint') }}
                    </p>
                </div>

                <!-- AssetRipper Path -->
                <div>
                    <label class="text-sm font-medium mb-1 block">
                        {{ t('dialog.vrca_bridge.assetripper_path') }}
                    </label>
                    <div class="flex items-center gap-2">
                        <input
                            v-model="assetRipperPath"
                            type="text"
                            class="a-input flex-1 text-sm"
                            :placeholder="t('dialog.vrca_bridge.assetripper_path_placeholder')" />
                        <Button variant="outline" size="sm" @click="browseAssetRipperPath">
                            <i class="ri-folder-open-line" />
                        </Button>
                    </div>
                    <div class="flex items-center justify-between mt-1">
                        <p class="text-xs text-muted-foreground">
                            {{ t('dialog.vrca_bridge.assetripper_hint') }}
                        </p>
                        <Button
                            v-if="!assetRipperPath"
                            variant="ghost"
                            size="xs"
                            class="text-xs h-5"
                            :disabled="isDownloadingRipper"
                            @click="downloadAssetRipper">
                            <i v-if="isDownloadingRipper" class="ri-loader-4-line animate-spin mr-1" />
                            <i v-else class="ri-download-line mr-1" />
                            {{ isDownloadingRipper ? t('dialog.vrca_bridge.downloading') : t('dialog.vrca_bridge.download_ripper') }}
                        </Button>
                    </div>
                </div>

                <!-- Auto-detect status -->
                <div v-if="autoDetectStatus" class="text-xs rounded bg-muted px-3 py-2 flex items-center gap-2">
                    <i v-if="autoDetectStatus === 'detecting'" class="ri-loader-4-line animate-spin text-muted-foreground" />
                    <i v-else-if="autoDetectStatus === 'found'" class="ri-check-line text-green-500" />
                    <i v-else-if="autoDetectStatus === 'partial'" class="ri-information-line text-yellow-500" />
                    <span class="text-muted-foreground">{{ autoDetectMessage }}</span>
                </div>

                <!-- Progress -->
                <div v-if="bridgeStatus !== 'idle'" class="rounded-lg bg-muted p-3 space-y-2">
                    <div class="flex items-center gap-2">
                        <i v-if="bridgeStatus === 'running'" class="ri-loader-4-line animate-spin text-primary" />
                        <i v-else-if="bridgeStatus === 'done'" class="ri-check-line text-green-500" />
                        <i v-else-if="bridgeStatus === 'error'" class="ri-error-warning-line text-destructive" />
                        <span class="text-sm font-medium">{{ statusLabel }}</span>
                    </div>
                    <div v-if="currentStep" class="text-xs text-muted-foreground">{{ currentStep }}</div>
                    <div v-if="progressLog.length" class="max-h-32 overflow-y-auto text-xs font-mono space-y-0.5 mt-2">
                        <div v-for="(line, i) in progressLog" :key="i" :class="line.startsWith('ERROR') ? 'text-destructive' : 'text-muted-foreground'">
                            {{ line }}
                        </div>
                    </div>
                </div>
            </div>

            <DialogFooter class="mt-4">
                <Button variant="outline" @click="closeDialog">
                    {{ t('dialog.vrca_bridge.close') }}
                </Button>
                <Button
                    :disabled="!canStart"
                    @click="startBridge">
                    <i class="ri-upload-cloud-line mr-2" />
                    {{ t('dialog.vrca_bridge.start') }}
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
</template>

<script setup>
    import { computed, ref, watch } from 'vue';
    import { useI18n } from 'vue-i18n';
    import { toast } from 'vue-sonner';

    import { Button } from '@/components/ui/button';
    import {
        Dialog,
        DialogContent,
        DialogDescription,
        DialogFooter,
        DialogHeader,
        DialogTitle
    } from '@/components/ui/dialog';
    import configRepository from '../../../services/config.js';

    const { t } = useI18n();

    const props = defineProps({
        isVrcaBridgeDialogVisible: {
            type: Boolean,
            default: false
        }
    });

    const emit = defineEmits(['close']);

    function closeDialog() {
        emit('close');
    }

    // Form state
    const selectedFilePath = ref('');
    const selectedFileName = ref('');
    const buildPC = ref(true);
    const buildQuest = ref(false);
    const unityEditorPath = ref('');
    const assetRipperPath = ref('');

    // Pipeline state
    const bridgeStatus = ref('idle'); // idle | running | done | error
    const currentStep = ref('');
    const progressLog = ref([]);

    // Auto-detect / download state
    const autoDetectStatus = ref(''); // '' | 'detecting' | 'found' | 'partial'
    const autoDetectMessage = ref('');
    const isDownloadingRipper = ref(false);

    const canStart = computed(() => {
        return (
            selectedFilePath.value &&
            unityEditorPath.value &&
            assetRipperPath.value &&
            bridgeStatus.value !== 'running'
        );
    });

    const statusLabel = computed(() => {
        switch (bridgeStatus.value) {
            case 'running':
                return t('dialog.vrca_bridge.status_running');
            case 'done':
                return t('dialog.vrca_bridge.status_done');
            case 'error':
                return t('dialog.vrca_bridge.status_error');
            default:
                return '';
        }
    });

    // Load saved paths and auto-detect on open
    watch(() => props.isVrcaBridgeDialogVisible, async (val) => {
        if (val) {
            // Reset state
            bridgeStatus.value = 'idle';
            progressLog.value = [];
            currentStep.value = '';
            autoDetectStatus.value = '';
            autoDetectMessage.value = '';

            const savedUnity = await configRepository.getString('VrcaBridge_unityPath', '');
            const savedRipper = await configRepository.getString('VrcaBridge_assetRipperPath', '');

            if (savedUnity) unityEditorPath.value = savedUnity;
            if (savedRipper) assetRipperPath.value = savedRipper;

            // Auto-detect if either path is missing
            if (!savedUnity || !savedRipper) {
                await autoDetectTools();
            }
        }
    });

    async function autoDetectTools() {
        autoDetectStatus.value = 'detecting';
        autoDetectMessage.value = t('dialog.vrca_bridge.detecting');

        try {
            const result = await window.interopApi.callDotNetMethod('VrcaBridge', 'FindTools', []);
            if (!result) {
                autoDetectStatus.value = '';
                return;
            }

            const found = JSON.parse(result);
            const foundPaths = [];

            if (found.unityPath && !unityEditorPath.value) {
                unityEditorPath.value = found.unityPath;
                await configRepository.setString('VrcaBridge_unityPath', found.unityPath);
                foundPaths.push('Unity');
            }

            if (found.assetRipperPath && !assetRipperPath.value) {
                assetRipperPath.value = found.assetRipperPath;
                await configRepository.setString('VrcaBridge_assetRipperPath', found.assetRipperPath);
                foundPaths.push('AssetRipper');
            }

            if (foundPaths.length > 0) {
                autoDetectStatus.value = unityEditorPath.value && assetRipperPath.value ? 'found' : 'partial';
                autoDetectMessage.value = t('dialog.vrca_bridge.detected', { tools: foundPaths.join(', ') });
            } else {
                autoDetectStatus.value = '';
            }
        } catch (err) {
            console.error('Auto-detect failed:', err);
            autoDetectStatus.value = '';
        }
    }

    async function downloadAssetRipper() {
        isDownloadingRipper.value = true;
        try {
            const result = await window.interopApi.callDotNetMethod('VrcaBridge', 'DownloadAssetRipper', []);
            if (result) {
                assetRipperPath.value = result;
                await configRepository.setString('VrcaBridge_assetRipperPath', result);
                toast.success(t('dialog.vrca_bridge.ripper_downloaded'));
            } else {
                toast.error(t('dialog.vrca_bridge.ripper_download_failed'));
            }
        } catch (err) {
            console.error('Download failed:', err);
            toast.error(t('dialog.vrca_bridge.ripper_download_failed'));
        } finally {
            isDownloadingRipper.value = false;
        }
    }

    async function browseFile() {
        try {
            const filePath = await window.electron.openVrcaFileDialog();
            if (filePath) {
                selectedFilePath.value = filePath;
                const parts = filePath.replace(/\\/g, '/').split('/');
                selectedFileName.value = parts[parts.length - 1];
            }
        } catch (err) {
            console.error('Failed to open file dialog:', err);
        }
    }

    function clearFile() {
        selectedFilePath.value = '';
        selectedFileName.value = '';
    }

    async function browseUnityPath() {
        try {
            const dir = await window.electron.openDirectoryDialog();
            if (dir) {
                unityEditorPath.value = dir;
                await configRepository.setString('VrcaBridge_unityPath', dir);
            }
        } catch (err) {
            console.error('Failed to open directory dialog:', err);
        }
    }

    async function browseAssetRipperPath() {
        try {
            const dir = await window.electron.openDirectoryDialog();
            if (dir) {
                assetRipperPath.value = dir;
                await configRepository.setString('VrcaBridge_assetRipperPath', dir);
            }
        } catch (err) {
            console.error('Failed to open directory dialog:', err);
        }
    }

    function addLog(msg) {
        progressLog.value.push(msg);
    }

    async function startBridge() {
        if (!canStart.value) return;

        bridgeStatus.value = 'running';
        currentStep.value = t('dialog.vrca_bridge.step_init');
        progressLog.value = [];

        // Save paths for next time
        await configRepository.setString('VrcaBridge_unityPath', unityEditorPath.value);
        await configRepository.setString('VrcaBridge_assetRipperPath', assetRipperPath.value);

        try {
            addLog('Starting VRCA Bridge pipeline...');
            addLog(`Input: ${selectedFileName.value}`);
            addLog(`Platforms: PC${buildQuest.value ? ' + Quest' : ''}`);

            // Stage 1: Extract with AssetRipper
            currentStep.value = t('dialog.vrca_bridge.step_extract');
            addLog('Stage 1: Extracting assets with AssetRipper...');

            const extractResult = await window.interopApi.callDotNetMethod(
                'VrcaBridge',
                'ExtractAssets',
                [selectedFilePath.value, assetRipperPath.value]
            );

            if (!extractResult) {
                throw new Error('AssetRipper extraction failed - check that AssetRipper path is correct');
            }
            addLog(`Extracted to: ${extractResult}`);

            // Stage 2: Create Unity project
            currentStep.value = t('dialog.vrca_bridge.step_project');
            addLog('Stage 2: Scaffolding Unity project...');

            const projectPath = await window.interopApi.callDotNetMethod(
                'VrcaBridge',
                'CreateUnityProject',
                [extractResult, unityEditorPath.value, buildQuest.value]
            );

            if (!projectPath) {
                throw new Error('Unity project creation failed - check that Unity path is correct');
            }
            addLog(`Project: ${projectPath}`);

            // Stage 3: Build with Unity
            currentStep.value = t('dialog.vrca_bridge.step_build');
            addLog('Stage 3: Building avatar bundle(s) via Unity...');

            const buildResult = await window.interopApi.callDotNetMethod(
                'VrcaBridge',
                'BuildAvatar',
                [projectPath, unityEditorPath.value, buildPC.value, buildQuest.value]
            );

            if (!buildResult) {
                throw new Error('Unity build failed - check Unity logs');
            }

            const bundles = JSON.parse(buildResult);
            addLog(`Built ${bundles.length} bundle(s)`);

            // Stage 4: Upload using VRChat session
            currentStep.value = t('dialog.vrca_bridge.step_upload');
            addLog('Stage 4: Uploading to VRChat...');

            for (const bundle of bundles) {
                addLog(`Uploading ${bundle.platform} bundle...`);

                const uploadResult = await window.interopApi.callDotNetMethod(
                    'VrcaBridge',
                    'UploadBundle',
                    [bundle.path, bundle.platform]
                );

                if (!uploadResult) {
                    throw new Error(`Upload failed for ${bundle.platform}`);
                }
                addLog(`${bundle.platform} upload complete`);
            }

            bridgeStatus.value = 'done';
            currentStep.value = '';
            addLog('All done! Avatar is now available in VRChat.');
            toast.success(t('dialog.vrca_bridge.toast_success'));

        } catch (err) {
            bridgeStatus.value = 'error';
            currentStep.value = '';
            addLog(`ERROR: ${err.message || err}`);
            toast.error(t('dialog.vrca_bridge.toast_error'));
        }
    }
</script>
