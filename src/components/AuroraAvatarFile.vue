<template>
    <section class="a-card mb-6">
        <h2 class="a-h2">{{ t('view.avatar_file.title') }}</h2>
        <p class="a-note mb-3">{{ t('view.avatar_file.desc') }}</p>
        <div class="flex flex-wrap items-center gap-2 mb-3">
            <input v-model="avatarId" class="a-input flex-1" placeholder="avtr_..." :aria-label="t('view.avatar_file.id')" />
            <button
                v-for="(label, key) in PLATFORMS"
                :key="key"
                type="button"
                class="a-btn"
                :class="{ on: platform === key }"
                @click="platform = key">
                {{ label }}
            </button>
        </div>
        <div class="flex flex-wrap items-center gap-2">
            <input type="file" accept=".vrca" :aria-label="t('view.avatar_file.pick')" @change="onFile" />
            <button type="button" class="a-btn" :disabled="busy || !file || !avatarId" @click="go">{{ t('view.avatar_file.upload') }}</button>
        </div>
        <p v-if="status" class="a-note mt-3">{{ status }}</p>
    </section>
</template>

<script setup>
    import { ref } from 'vue';
    import { toast } from 'vue-sonner';
    import { useI18n } from 'vue-i18n';

    import { PLATFORMS, replaceAvatarBundle } from '../services/avatarBundle';

    const { t } = useI18n();
    const avatarId = ref('');
    const platform = ref('standalonewindows');
    const file = ref(null);
    const status = ref('');
    const busy = ref(false);

    function onFile(e) {
        file.value = e.target.files?.[0] || null;
    }

    async function go() {
        busy.value = true;
        try {
            const id = (avatarId.value.match(/avtr_[0-9a-f-]{36}/) || [avatarId.value.trim()])[0];
            const res = await replaceAvatarBundle(id, platform.value, file.value, (m) => (status.value = m));
            status.value = t('view.avatar_file.done', { unity: res.unityVersion });
            toast.success(status.value);
        } catch (e) {
            status.value = String(e?.message || e);
            toast.error(status.value);
        } finally {
            busy.value = false;
        }
    }
</script>
