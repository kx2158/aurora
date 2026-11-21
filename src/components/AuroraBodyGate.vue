<template>
    <div>
        <slot v-if="bodyUnlocked" />
        <section v-else class="a-card flex flex-col gap-3">
            <h2 class="a-h2">{{ t('view.body_lock.title') }}</h2>
            <p class="a-note">{{ t('view.body_lock.desc') }}</p>
            <form class="flex items-center gap-2" @submit.prevent="submit">
                <input
                    v-model="password"
                    type="password"
                    class="a-input"
                    autocomplete="off"
                    :placeholder="t('view.body_lock.placeholder')" />
                <button type="submit" class="a-btn">{{ t('view.body_lock.unlock') }}</button>
            </form>
            <p v-if="wrong" class="a-note">{{ t('view.body_lock.wrong') }}</p>
        </section>
    </div>
</template>

<script setup>
    import { onMounted, ref } from 'vue';
    import { useI18n } from 'vue-i18n';

    import { bodyUnlocked, initBodyLock, tryUnlock } from '../services/auroraBodyLock';

    const { t } = useI18n();
    const password = ref('');
    const wrong = ref(false);

    onMounted(initBodyLock);

    async function submit() {
        wrong.value = !(await tryUnlock(password.value));
        password.value = '';
    }
</script>
