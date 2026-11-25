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
                <!-- File Selection + Drop Zone -->
                <div>
                    <label class="text-sm font-medium mb-1 block">
                        {{ t('dialog.vrca_bridge.file_label') }}
                    </label>
                    <!-- Drop zone -->
                    <div
                        class="border-2 border-dashed rounded-lg px-4 py-3 text-center transition-colors cursor-pointer select-none"
                        :class="isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-muted-foreground/50'"
                        @dragenter.prevent="isDragging = true"
                        @dragover.prevent="isDragging = true"
                        @dragleave.prevent="isDragging = false"
                        @drop.prevent="onDrop"
                        @click="browseFile">
                        <i class="ri-upload-cloud-2-line text-2xl text-muted-foreground mb-1 block" />
                        <p class="text-sm text-muted-foreground">
                            {{ t('dialog.vrca_bridge.drop_hint') }}
                        </p>
                        <p class="text-xs text-muted-foreground/60 mt-0.5">
                            {{ t('dialog.vrca_bridge.drop_sub') }}
                        </p>
                    </div>
                    <!-- File queue -->
                    <div v-if="fileQueue.length" class="mt-2 space-y-1 max-h-32 overflow-y-auto">
                        <div
                            v-for="(f, i) in fileQueue"
                            :key="f.path"
                            class="flex items-center gap-2 rounded px-2 py-1 text-sm"
                            :class="i === currentFileIndex && bridgeStatus === 'running' ? 'bg-primary/10' : 'bg-muted/50'">
                            <i v-if="f.status === 'done'" class="ri-check-line text-green-500 shrink-0" />
                            <i v-else-if="f.status === 'error'" class="ri-error-warning-line text-destructive shrink-0" />
                            <i v-else-if="f.status === 'running'" class="ri-loader-4-line animate-spin text-primary shrink-0" />
                            <i v-else class="ri-file-3-line text-muted-foreground shrink-0" />
                            <span class="truncate flex-1">{{ f.name }}</span>
                            <Button
                                v-if="f.status !== 'running'"
                                variant="ghost" size="icon-xs"
                                @click.stop="removeFromQueue(i)">
                                <i class="ri-close-line text-xs" />
                            </Button>
                        </div>
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
                    {{ fileQueue.length > 1 ? t('dialog.vrca_bridge.start_multi', { count: fileQueue.length }) : t('dialog.vrca_bridge.start') }}
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
    const fileQueue = ref([]); // [{ path, name, status: 'pending'|'running'|'done'|'error' }]
    const currentFileIndex = ref(0);
    const isDragging = ref(false);
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
            fileQueue.value.some(f => f.status === 'pending') &&
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
            fileQueue.value = [];
            currentFileIndex.value = 0;
            isDragging.value = false;

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

    function addPathsToQueue(paths) {
        for (const p of paths) {
            if (!p.toLowerCase().endsWith('.vrca')) continue;
            if (fileQueue.value.some(f => f.path === p)) continue;
            const parts = p.replace(/\\/g, '/').split('/');
            fileQueue.value.push({ path: p, name: parts[parts.length - 1], status: 'pending' });
        }
    }

    async function browseFile() {
        try {
            const result = await window.electron.openVrcaFileDialog();
            if (result) {
                // Support both single string and array (multi-select)
                const paths = Array.isArray(result) ? result : [result];
                addPathsToQueue(paths);
            }
        } catch (err) {
            console.error('Failed to open file dialog:', err);
        }
    }

    function removeFromQueue(index) {
        fileQueue.value.splice(index, 1);
    }

    function onDrop(event) {
        isDragging.value = false;
        const files = Array.from(event.dataTransfer?.files ?? []);
        const paths = files.map(f => f.path).filter(Boolean);
        addPathsToQueue(paths);
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

    async function processSingleFile(file) {
        addLog(`\n--- ${file.name} ---`);
        addLog(`Platforms: PC${buildQuest.value ? ' + Quest' : ''}`);

        // Stage 1: Extract
        currentStep.value = t('dialog.vrca_bridge.step_extract');
        addLog('Stage 1: Extracting assets with AssetRipper...');
        const extractResult = await window.interopApi.callDotNetMethod(
            'VrcaBridge', 'ExtractAssets', [file.path, assetRipperPath.value]
        );
        if (!extractResult) throw new Error('AssetRipper extraction failed');
        addLog(`Extracted to: ${extractResult}`);

        // Stage 2: Unity project
        currentStep.value = t('dialog.vrca_bridge.step_project');
        addLog('Stage 2: Scaffolding Unity project...');
        const projectPath = await window.interopApi.callDotNetMethod(
            'VrcaBridge', 'CreateUnityProject', [extractResult, unityEditorPath.value, buildQuest.value]
        );
        if (!projectPath) throw new Error('Unity project creation failed');
        addLog(`Project: ${projectPath}`);

        // Stage 3: Build
        currentStep.value = t('dialog.vrca_bridge.step_build');
        addLog('Stage 3: Building avatar bundle(s)...');
        const buildResult = await window.interopApi.callDotNetMethod(
            'VrcaBridge', 'BuildAvatar', [projectPath, unityEditorPath.value, buildPC.value, buildQuest.value]
        );
        if (!buildResult) throw new Error('Unity build failed');
        const bundles = JSON.parse(buildResult);
        addLog(`Built ${bundles.length} bundle(s)`);

        // Stage 4: Upload
        currentStep.value = t('dialog.vrca_bridge.step_upload');
        addLog('Stage 4: Uploading to VRChat...');
        for (const bundle of bundles) {
            addLog(`Uploading ${bundle.platform} bundle...`);
            const uploadResult = await window.interopApi.callDotNetMethod(
                'VrcaBridge', 'UploadBundle', [bundle.path, bundle.platform]
            );
            if (!uploadResult) throw new Error(`Upload failed for ${bundle.platform}`);
            addLog(`${bundle.platform} upload complete`);
        }
    }

    async function startBridge() {
        if (!canStart.value) return;

        bridgeStatus.value = 'running';
        progressLog.value = [];
        currentStep.value = t('dialog.vrca_bridge.step_init');

        await configRepository.setString('VrcaBridge_unityPath', unityEditorPath.value);
        await configRepository.setString('VrcaBridge_assetRipperPath', assetRipperPath.value);

        const pending = fileQueue.value.filter(f => f.status === 'pending');
        let anyError = false;

        for (let i = 0; i < fileQueue.value.length; i++) {
            const file = fileQueue.value[i];
            if (file.status !== 'pending') continue;

            currentFileIndex.value = i;
            file.status = 'running';

            try {
                await processSingleFile(file);
                file.status = 'done';
            } catch (err) {
                file.status = 'error';
                anyError = true;
                addLog(`ERROR: ${err.message || err}`);
            }
        }

        bridgeStatus.value = anyError ? 'error' : 'done';
        currentStep.value = '';

        if (!anyError) {
            const count = pending.length;
            addLog(count > 1
                ? `All done! ${count} avatars are now available in VRChat.`
                : 'All done! Avatar is now available in VRChat.'
            );
            toast.success(pending.length > 1
                ? t('dialog.vrca_bridge.toast_success_multi', { count: pending.length })
                : t('dialog.vrca_bridge.toast_success')
            );
        } else {
            toast.error(t('dialog.vrca_bridge.toast_error'));
        }
    }
</script>
