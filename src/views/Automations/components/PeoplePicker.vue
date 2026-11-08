<template>
    <div class="pp">
        <div class="pp-add">
            <input
                v-model="query"
                class="a-input flex-1"
                :list="listId"
                :placeholder="placeholder"
                @keydown.enter.prevent="add" />
            <datalist :id="listId">
                <option v-for="n in names" :key="n" :value="n"></option>
            </datalist>
            <button type="button" class="a-btn icon" :aria-label="t('view.automations.add')" @click="add">
                <AuroraIcon name="plus" :size="15" />
            </button>
        </div>
        <div v-if="people.length" class="pp-chips">
            <span v-for="p in people" :key="p.id" class="pp-chip" :class="{ on: isOnline(p.id) }">
                <i class="pp-dot"></i>
                {{ p.name }}
                <button type="button" :aria-label="t('view.automations.remove')" @click="removePerson(people, p.id)">
                    <AuroraIcon name="close" :size="12" />
                </button>
            </span>
        </div>
    </div>
</template>

<script setup>
    import { computed, ref } from 'vue';
    import { toast } from 'vue-sonner';
    import { useI18n } from 'vue-i18n';

    import AuroraIcon from '../../../components/AuroraIcon.vue';
    import { addPerson, removePerson } from '../../../services/auroraStatusRules';
    import { useFriendStore } from '../../../stores';

    /** Pick friends by name. Edits the given array in place. */
    const props = defineProps({
        people: { type: Array, required: true },
        placeholder: { type: String, default: '' }
    });

    const { t } = useI18n();
    const friendStore = useFriendStore();
    const query = ref('');
    const listId = `pp-${Math.random().toString(36).slice(2, 8)}`;

    const friends = computed(() =>
        Array.from(friendStore.friends.values()).map((f) => ({ id: f.id, name: f.name || f.ref?.displayName || f.id, state: f.state }))
    );
    const names = computed(() =>
        friends.value
            .filter((f) => !props.people.some((p) => p.id === f.id))
            .map((f) => f.name)
            .sort((a, b) => a.localeCompare(b))
    );
    const isOnline = (id) => friendStore.friends.get(id)?.state === 'online';

    function add() {
        const q = query.value.trim().toLowerCase();
        if (!q) {
            return;
        }
        const hit = friends.value.find((f) => String(f.name).toLowerCase() === q);
        if (!hit) {
            toast.error(t('view.automations.not_found'));
            return;
        }
        addPerson(props.people, hit.id, hit.name);
        query.value = '';
    }
</script>

<style scoped>
    .pp {
        display: flex;
        flex-direction: column;
        gap: 8px;
        width: 100%;
    }
    .pp-add {
        display: flex;
        gap: 8px;
    }
    .pp-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }
    .pp-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 28px;
        padding: 0 6px 0 10px;
        font-size: 0.8rem;
        border-radius: 999px;
        border: 1px solid var(--a-line);
        background: var(--a-soft);
    }
    .pp-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: color-mix(in oklch, var(--foreground) 25%, transparent);
    }
    .pp-chip.on .pp-dot {
        background: var(--a-accent);
    }
    .pp-chip button {
        display: grid;
        place-items: center;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        color: var(--a-muted);
    }
    .pp-chip button:hover {
        color: var(--foreground);
        background: var(--a-line);
    }
</style>
