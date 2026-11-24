<template>
    <div class="au-page">
        <section class="au-left au-listcol">
            <div class="aura-label">人 · {{ t('aura.people.count', { n: people.length }) }}</div>
            <input v-model="q" class="au-search" :placeholder="t('aura.people.search')" />
            <div class="au-scroll">
                <button
                    v-for="p in shown"
                    :key="p.id"
                    type="button"
                    class="au-person"
                    :class="{ on: p.id === sel?.id, dim: p.state !== 'online' }"
                    :aria-pressed="p.id === sel?.id"
                    @click="selId = p.id">
                    <span class="au-dot" :class="p.state"></span>
                    <span class="au-pname">{{ p.name }}</span>
                    <span class="au-pstate">{{ stateText(p.state) }}</span>
                </button>
            </div>
        </section>

        <AuraStage kanji="人" :size="420" side="right" offset="8%" variant="c">
            <article v-if="sel" class="pp-card">
                <div class="pp-banner" :style="sel.banner ? { backgroundImage: `url(${sel.banner})` } : null"></div>
                <div class="pp-head">
                    <div class="pp-avatar">
                        <img v-if="sel.photo" :src="sel.photo" alt="" />
                        <span class="pp-status" :class="sel.state"></span>
                    </div>
                    <div class="pp-id">
                        <div class="aura-label">
                            {{ stateText(sel.state).toUpperCase() }}{{ sel.where ? ' · ' + sel.where.toUpperCase() : '' }}
                        </div>
                        <h2 class="pp-name">{{ sel.name }}</h2>
                        <div v-if="sel.statusText" class="pp-statustext">{{ sel.statusText }}</div>
                    </div>
                </div>

                <div v-if="sel.bio" class="pp-block">
                    <div class="aura-label">{{ t('aura.people.about') }}</div>
                    <p class="pp-bio">{{ sel.bio }}</p>
                </div>

                <div class="pp-grid">
                    <div><span>{{ t('aura.people.since') }}</span><b>{{ sel.since }}</b></div>
                    <div><span>{{ t('aura.people.together') }}</span><b>{{ sel.together }}</b></div>
                    <div><span>{{ t('aura.people.joins') }}</span><b>{{ sel.joins }}</b></div>
                    <div><span>{{ t('aura.people.mutual') }}</span><b>{{ sel.mutual }}</b></div>
                    <div><span>{{ t('aura.people.last') }}</span><b>{{ sel.last }}</b></div>
                    <div><span>{{ t('aura.people.platform') }}</span><b>{{ sel.platform }}</b></div>
                </div>

                <div v-if="sel.note" class="pp-block">
                    <div class="aura-label">{{ t('aura.people.note') }}</div>
                    <p class="pp-bio">{{ sel.note }}</p>
                </div>

                <div class="pp-block">
                    <div class="aura-label">{{ t('aura.people.alerts') }}</div>
                    <FriendAlertToggles :user-id="sel.id" />
                </div>

                <div class="pp-actions">
                    <button v-if="sel.tag" type="button" class="pp-btn main" @click="launch.showLaunchDialog(sel.tag)">
                        {{ t('aura.join') }}
                    </button>
                    <button v-if="sel.state === 'online'" type="button" class="pp-btn" @click="askInvite(sel.id)">
                        {{ t('aura.people.invite') }}
                    </button>
                    <button type="button" class="pp-btn" @click="showUserDialog(sel.id)">
                        {{ t('aura.people.profile') }}
                    </button>
                </div>
            </article>
        </AuraStage>
    </div>
</template>

<script setup>
    import { computed, onMounted, ref } from 'vue';
    import { storeToRefs } from 'pinia';
    import { toast } from 'vue-sonner';
    import { useI18n } from 'vue-i18n';

    import { notificationRequest } from '../../api';
    import AuraStage from '../../components/AuraStage.vue';
    import FriendAlertToggles from '../../components/FriendAlertToggles.vue';
    import { useUserDisplay } from '../../composables/useUserDisplay';
    import { showUserDialog } from '../../coordinators/userCoordinator';
    import { fmtDuration } from '../../services/auroraStats';
    import { loadFriendAlerts } from '../../services/friendAlerts';
    import { isRealInstance } from '../../shared/utils/instance';
    import { useFriendStore, useLaunchStore } from '../../stores';

    const { t } = useI18n();
    const launch = useLaunchStore();
    const { userImage } = useUserDisplay();
    const { friends } = storeToRefs(useFriendStore());
    const q = ref('');
    const selId = ref('');

    onMounted(() => loadFriendAlerts());

    const ORDER = { online: 0, active: 1, offline: 2 };
    const stateText = (s) => t(`aura.people.s_${s === 'online' || s === 'active' ? s : 'offline'}`);
    const ms = (v) => (typeof v === 'number' ? v : Date.parse(v) || 0);

    const people = computed(() =>
        [...friends.value.values()]
            .filter((c) => c.ref)
            .map((c) => ({
                id: c.id,
                name: c.ref.displayName || c.name || c.id,
                state: c.state || 'offline',
                ref: c.ref
            }))
            .sort((a, b) => (ORDER[a.state] ?? 2) - (ORDER[b.state] ?? 2) || a.name.localeCompare(b.name))
    );
    const shown = computed(() => {
        const needle = q.value.trim().toLowerCase();
        return (needle ? people.value.filter((p) => p.name.toLowerCase().includes(needle)) : people.value).slice(0, 300);
    });

    const sel = computed(() => {
        const p = people.value.find((x) => x.id === selId.value) || shown.value[0];
        if (!p) return null;
        const r = p.ref;
        const tag = r.$location?.tag;
        const since = ms(r.$friendSince) || ms(r.date_joined);
        const seen = ms(r.$lastSeen) || ms(r.last_login);
        const platform = String(r.last_platform || '').replace('standalonewindows', 'pc').replace('android', 'quest');
        return {
            id: p.id,
            name: p.name,
            state: p.state,
            photo: userImage(r, true),
            banner: r.bannerUrl || '',
            statusText: r.statusDescription || '',
            bio: String(r.bio || '').slice(0, 400),
            tag: p.state === 'online' && tag && isRealInstance(tag) ? tag : '',
            where: r.$location?.accessTypeName || '',
            since: since ? new Date(since).toISOString().slice(0, 7).replace('-', '.') : '-',
            together: r.$timeSpent ? fmtDuration(r.$timeSpent) : '-',
            joins: r.$joinCount || 0,
            mutual: r.$mutualCount ?? '-',
            last: seen ? new Date(seen).toLocaleDateString() : '-',
            platform: platform || '-',
            note: r.$memo || r.note || ''
        };
    });

    function askInvite(id) {
        notificationRequest
            .sendRequestInvite({ platform: 'standalonewindows' }, id)
            .then(() => toast(t('message.user.request_invite_sent')))
            .catch(() => {});
    }
</script>
