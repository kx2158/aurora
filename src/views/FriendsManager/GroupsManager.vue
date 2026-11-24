<template>
    <section class="a-card fa-wrap">
        <div class="fa-top">
            <input v-model="q" class="fa-search" :placeholder="t('view.friends_manager.groups.search')" />
            <div class="a-seg">
                <button v-for="f in filters" :key="f" type="button" :class="{ on: filter === f }" @click="filter = f">
                    {{ t(`view.friends_manager.review.f_${f}`) }}
                    <small>{{ counts[f] }}</small>
                </button>
            </div>
        </div>
        <p class="a-note">{{ t('view.friends_manager.groups.note') }}</p>
        <div v-if="!shown.length" class="a-empty">{{ t('view.friends_manager.groups.empty') }}</div>
        <div class="gm-new">
            <input v-model="newFolder" class="fa-search" :placeholder="t('view.friends_manager.groups.new_folder')" @keydown.enter.prevent="makeFolder" />
            <button type="button" class="a-btn" @click="makeFolder">{{ t('view.friends_manager.groups.add_folder') }}</button>
        </div>
        <template v-for="sec in sections" :key="sec.folder ? sec.folder.id : 'loose'">
            <div v-if="sec.folder" class="gm-folder">
                <button type="button" class="gm-fold" :aria-expanded="sec.folder.open" @click="sec.folder.open = !sec.folder.open">
                    <span class="gm-caret" :class="{ open: sec.folder.open }">&#9656;</span>
                    {{ sec.folder.name }}
                    <small>{{ sec.groups.length }}</small>
                </button>
                <button type="button" class="a-btn" @click="removeFolder(sec.folder.id)">{{ t('view.friends_manager.groups.remove_folder') }}</button>
            </div>
            <p v-if="sec.folder && sec.folder.open && !sec.groups.length" class="a-note">{{ t('view.friends_manager.groups.folder_empty') }}</p>
            <template v-if="!sec.folder || sec.folder.open">
                <div v-for="g in sec.groups" :key="g.id" class="a-row fa-row" :class="{ 'gm-in': sec.folder }">
                    <img v-if="g.iconUrl" :src="g.iconUrl" class="fa-photo" alt="" loading="lazy" />
                    <button type="button" class="fa-name gm-open" @click="showGroupDialog(g.id)">{{ g.name }}</button>
                    <span class="a-pill">{{ g.memberCount ?? '?' }}</span>
                    <select
                        class="a-input gm-move"
                        :value="folderOf(g.id)"
                        :aria-label="t('view.friends_manager.groups.move')"
                        @change="moveGroup(g.id, $event.target.value)">
                        <option value="">{{ t('view.friends_manager.groups.no_folder') }}</option>
                        <option v-for="f in groupFolders" :key="f.id" :value="f.id">{{ f.name }}</option>
                    </select>
                    <DecisionNote kind="group" :id="g.id" />
                    <button type="button" class="a-btn" @click="leaveGroupPrompt(g.id)">
                        {{ t('view.friends_manager.groups.leave') }}
                    </button>
                </div>
            </template>
        </template>
    </section>
</template>

<script setup>
    import { computed, onMounted, ref } from 'vue';
    import { storeToRefs } from 'pinia';
    import { useI18n } from 'vue-i18n';

    import DecisionNote from '../../components/DecisionNote.vue';
    import { leaveGroupPrompt, showGroupDialog } from '../../coordinators/groupCoordinator';
    import { decisions } from '../../services/decisionNotes';
    import {
        addFolder,
        folderOf,
        groupFolders,
        initGroupFolders,
        moveGroup,
        removeFolder,
        sectionsFor
    } from '../../services/groupFolders';
    import { useGroupStore } from '../../stores';

    const { t } = useI18n();
    const { currentUserGroups } = storeToRefs(useGroupStore());
    const q = ref('');
    const filter = ref('all');
    const filters = ['all', 'keep', 'cut', 'none'];
    const newFolder = ref('');
    onMounted(initGroupFolders);
    function makeFolder() {
        addFolder(newFolder.value);
        newFolder.value = '';
    }

    const groups = computed(() =>
        [...currentUserGroups.value.values()]
            .map((g) => ({ id: g.id, name: g.name || g.id, iconUrl: g.iconUrl, memberCount: g.memberCount }))
            .sort((a, b) => a.name.localeCompare(b.name))
    );
    const markOf = (id) => decisions.value.group[id]?.m || '';
    const counts = computed(() => {
        const c = { all: groups.value.length, keep: 0, cut: 0, none: 0 };
        for (const g of groups.value) c[markOf(g.id) || 'none']++;
        return c;
    });
    const shown = computed(() => {
        const needle = q.value.trim().toLowerCase();
        return groups.value.filter((g) => {
            if (filter.value !== 'all' && (markOf(g.id) || 'none') !== filter.value) return false;
            return !needle || g.name.toLowerCase().includes(needle);
        });
    });
    const sections = computed(() => sectionsFor(shown.value, groupFolders.value));
</script>

<style>
    .gm-new,
    .gm-folder {
        display: flex;
        align-items: center;
        gap: 12px;
        margin: 14px 0 6px;
    }
    .gm-fold {
        flex: 1;
        display: flex;
        align-items: baseline;
        gap: 10px;
        font-size: 20px;
        font-weight: 200;
        text-align: left;
        color: inherit;
        background: none;
        cursor: pointer;
    }
    .gm-fold small {
        font-size: 11px;
        opacity: 0.6;
    }
    .gm-caret {
        display: inline-block;
        transition: transform 0.2s ease;
    }
    .gm-caret.open {
        transform: rotate(90deg);
    }
    .gm-in {
        margin-left: 22px;
    }
    .gm-move {
        max-width: 150px;
    }
    .gm-open {
        background: none;
        border: 0;
        padding: 0;
        text-align: left;
        color: inherit;
        cursor: pointer;
    }
</style>
