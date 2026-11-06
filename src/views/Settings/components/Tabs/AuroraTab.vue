<template>
    <div class="flex flex-col gap-10 py-2">
        <div class="flex items-center gap-4">
            <AuroraMascot :size="72" />
            <div class="flex flex-col">
                <span class="text-base font-semibold text-foreground">Aurora</span>
                <span class="text-xs text-muted-foreground">{{ t('view.settings.aurora.tagline') }}</span>
            </div>
        </div>
        <SettingsGroup v-if="boopsUnlocked" id="nx-boops" :title="t('view.settings.aurora.boops')">
            <div class="flex flex-col gap-3">
                <div class="grid grid-cols-2 gap-2 md:grid-cols-3">
                    <button
                        v-for="(line, i) in boopCode.lines"
                        :key="i"
                        type="button"
                        class="nx-troll"
                        @click="sendLine(i)">
                        {{ line }}
                    </button>
                </div>
                <p class="text-xs text-muted-foreground">{{ t('view.settings.aurora.boops_desc') }}</p>
                <label class="flex items-center gap-2 text-sm">
                    <span class="w-56">{{ t('view.settings.aurora.boops_enabled') }}</span>
                    <Switch :model-value="boopCode.enabled" @update:modelValue="(v) => { boopCode.enabled = v; saveBoopCode(); }" />
                </label>
                <label class="flex items-center gap-2 text-sm">
                    <span class="w-56">{{ t('view.settings.aurora.boops_pass') }}</span>
                    <Input v-model="boopCode.passphrase" type="password" class="flex-1" @change="saveBoopCode" />
                </label>
                <label class="flex items-center gap-2 text-sm">
                    <span class="w-56">{{ t('view.settings.aurora.boops_trusted') }}</span>
                    <Input
                        :model-value="boopCode.trusted.join(', ')"
                        :placeholder="t('view.settings.aurora.boops_trusted_ph')"
                        class="flex-1"
                        @change="(e) => { boopCode.trusted = e.target.value.split(',').map((x) => x.trim()).filter(Boolean); saveBoopCode(); }" />
                </label>
                <div class="flex items-center gap-2 text-sm">
                    <span class="w-56">{{ t('view.settings.aurora.boops_target') }}</span>
                    <Input v-model="boopCode.target" :placeholder="t('view.settings.aurora.rules_add_ph')" class="flex-1" @change="saveBoopCode" />
                </div>
                <div class="flex items-center gap-2 text-sm">
                    <span class="w-56">{{ t('view.settings.aurora.boops_newpass') }}</span>
                    <Input v-model="newBoopPass" type="password" class="flex-1" @change="saveNewBoopPass" />
                    <Button size="sm" variant="outline" @click="lockBoops">{{ t('view.settings.aurora.boops_lock') }}</Button>
                </div>
            </div>
        </SettingsGroup>
        <SettingsGroup id="nx-chatbox" :title="t('view.settings.aurora.chatbox')">
            <SettingsItem
                :label="t('view.settings.aurora.chatbox')"
                :description="t('view.settings.aurora.chatbox_desc')"
                toggle>
                <Switch
                    :model-value="chatboxEnabled"
                    :ariaLabel="t('view.settings.aurora.chatbox')"
                    @update:modelValue="setChatboxEnabled" />
            </SettingsItem>
            <SettingsItem :label="t('view.settings.aurora.chatbox_template')" :description="t('view.settings.aurora.chatbox_template_desc')">
                <Input :model-value="chatboxTemplate" class="w-80" @update:modelValue="setChatboxTemplate" />
            </SettingsItem>
            <SettingsItem :label="t('view.settings.aurora.chatbox_interval')">
                <Input
                    type="number"
                    min="3"
                    max="60"
                    :model-value="chatboxInterval"
                    class="w-24"
                    @update:modelValue="setChatboxInterval" />
            </SettingsItem>
            <SettingsItem :label="t('view.settings.aurora.chatbox_notify')" toggle>
                <Switch
                    :model-value="chatboxNotify"
                    :ariaLabel="t('view.settings.aurora.chatbox_notify')"
                    @update:modelValue="setChatboxNotify" />
            </SettingsItem>
            <SettingsItem :label="t('view.settings.aurora.chatbox_preview')">
                <span class="text-xs text-muted-foreground">{{ chatboxPreview || '...' }}</span>
            </SettingsItem>
        </SettingsGroup>
        <SettingsGroup id="nx-music" :title="t('view.settings.aurora.mm')">
            <p class="mb-2 text-xs text-muted-foreground">{{ t('view.settings.aurora.mm_desc') }}</p>
            <div class="flex flex-col gap-2">
                <label class="flex items-center gap-2 text-sm">
                    <span class="w-56">{{ t('view.settings.aurora.mm_app') }}</span>
                    <select class="nx-sel" :value="mm.app" @change="(e) => setMm('app', e.target.value)">
                        <option value="">{{ t('view.settings.aurora.mm_none') }}</option>
                        <option v-for="a in audioApps" :key="a" :value="a">{{ a }}</option>
                    </select>
                </label>
                <label class="flex items-center gap-2 text-sm">
                    <span class="w-56">{{ t('view.settings.aurora.mm_mic') }}</span>
                    <select class="nx-sel" :value="mm.mic" @change="(e) => setMm('mic', e.target.value)">
                        <option value="">{{ t('view.settings.aurora.mm_none') }}</option>
                        <option v-for="d in audioDevices.capture" :key="d.id" :value="d.id">{{ d.name }}</option>
                    </select>
                </label>
                <label class="flex items-center gap-2 text-sm">
                    <span class="w-56">{{ t('view.settings.aurora.mm_out') }}</span>
                    <select class="nx-sel" :value="mm.out" @change="(e) => setMm('out', e.target.value)">
                        <option value="">{{ t('view.settings.aurora.mm_none') }}</option>
                        <option v-for="d in audioDevices.render" :key="d.id" :value="d.id">{{ d.name }}</option>
                    </select>
                </label>
                <label class="flex items-center gap-2 text-sm">
                    <span class="w-56">{{ t('view.settings.aurora.mm_latency') }}</span>
                    <select class="nx-sel" :value="mm.latency" @change="(e) => setMm('latency', Number(e.target.value))">
                        <option :value="10">{{ t('view.settings.aurora.mm_lat_low') }}</option>
                        <option :value="30">{{ t('view.settings.aurora.mm_lat_mid') }}</option>
                        <option :value="80">{{ t('view.settings.aurora.mm_lat_safe') }}</option>
                    </select>
                </label>
                <label class="flex items-center gap-2 text-sm">
                    <span class="w-56">{{ t('view.settings.aurora.mm_music_vol') }} {{ Math.round(mm.musicVol * 100) }}%</span>
                    <input type="range" min="0" max="10" step="0.1" :value="mm.musicVol" class="flex-1" @input="(e) => setMm('musicVol', Number(e.target.value))" />
                </label>
                <label class="flex items-center gap-2 text-sm">
                    <span class="w-56">{{ t('view.settings.aurora.mm_mic_vol') }} {{ Math.round(mm.micVol * 100) }}%</span>
                    <input type="range" min="0" max="5" step="0.05" :value="mm.micVol" class="flex-1" @input="(e) => setMm('micVol', Number(e.target.value))" />
                </label>
                <div class="flex items-center gap-2">
                    <Button size="sm" @click="toggleMusicMic">{{ mm.running ? t('view.settings.aurora.mm_stop') : t('view.settings.aurora.mm_start') }}</Button>
                    <Button size="sm" :variant="mm.micMuted ? 'destructive' : 'outline'" @click="toggleMicMute">{{
                        mm.micMuted ? t('view.settings.aurora.mm_unmute') : t('view.settings.aurora.mm_mute')
                    }}</Button>
                    <Button size="sm" variant="outline" @click="refreshAudioLists">{{ t('view.settings.aurora.mm_refresh') }}</Button>
                    <span v-if="mm.error" class="text-xs text-destructive">{{ mm.error }}</span>
                </div>
                <div v-if="mm.running" class="flex flex-col gap-1 text-xs">
                    <div v-for="m in meters" :key="m.key" class="flex items-center gap-2">
                        <span class="w-16">{{ m.label }}</span>
                        <div class="h-2 flex-1 bg-muted">
                            <div class="h-2 bg-primary" :style="{ width: Math.min(100, mm[m.key] * 140) + '%' }"></div>
                        </div>
                    </div>
                    <span class="text-muted-foreground">{{ mm.info }}</span>
                </div>
            </div>
        </SettingsGroup>
        <SettingsGroup id="nx-character" :title="t('view.settings.aurora.character')">
            <div class="flex flex-wrap gap-2">
                <Button
                    v-for="c in characterList"
                    :key="c"
                    size="sm"
                    :variant="character === c ? 'default' : 'outline'"
                    @click="setCharacter(c)">
                    {{ prettyName(c) }}
                </Button>
            </div>
            <p class="text-xs text-muted-foreground">{{ t('view.settings.aurora.character_desc') }}</p>
        </SettingsGroup>
        <SettingsGroup id="nx-addons" :title="t('view.settings.aurora.addons')">
            <div class="flex flex-col gap-3">
                <p class="text-xs text-muted-foreground">{{ t('view.settings.aurora.addons_desc') }}</p>
                <div class="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" @click="openAddonsFolder">{{ t('view.settings.aurora.addons_open') }}</Button>
                    <Button size="sm" variant="outline" @click="refreshAddons">{{ t('view.settings.aurora.addons_refresh') }}</Button>
                </div>
                <label class="flex items-center gap-2 text-sm">
                    <span class="w-56">{{ t('view.settings.aurora.addons_voice') }}</span>
                    <select class="nx-sel" :value="addonVoice" @change="(e) => setAddonVoice(e.target.value)">
                        <option value="">{{ t('view.settings.aurora.addons_default_voice') }}</option>
                        <option v-for="a in visibleAddons.filter((x) => Object.keys(x.voice || {}).length)" :key="a.id" :value="a.id">
                            {{ a.name }}
                        </option>
                    </select>
                </label>
                <label class="flex items-center gap-2 text-sm">
                    <span class="w-56">{{ t('view.settings.aurora.addons_secret') }}</span>
                    <input
                        v-model="addonSecret"
                        class="nx-sel"
                        type="text"
                        autocomplete="off"
                        :placeholder="addonSecretMsg"
                        @keydown.enter.prevent="tryUnlockAddon" />
                    <Button size="sm" variant="outline" @click="tryUnlockAddon">{{ t('view.settings.aurora.addons_unlock') }}</Button>
                </label>
                <div v-for="a in visibleAddons" :key="a.id" class="flex items-center gap-2 text-sm">
                    <span class="flex-1">{{ a.name }}<span v-if="a.author" class="text-muted-foreground"> - {{ a.author }}</span></span>
                    <span class="text-xs text-muted-foreground">
                        {{ a.faces?.length ? t('view.settings.aurora.addons_faces', { n: a.faces.length }) : '' }}
                        {{ Object.keys(a.voice || {}).length ? t('view.settings.aurora.addons_clips', { n: Object.keys(a.voice).length }) : '' }}
                    </span>
                </div>
                <p v-if="!visibleAddons.length" class="text-xs text-muted-foreground">{{ t('view.settings.aurora.addons_none') }}</p>
            </div>
        </SettingsGroup>
        <SettingsGroup id="nx-accent" :title="t('view.settings.aurora.accent')">
            <SettingsItem :label="t('view.settings.aurora.accent_desc')">
                <div class="flex flex-wrap items-center gap-2">
                    <button
                        v-for="p in ACCENT_PRESETS"
                        :key="p.hex"
                        type="button"
                        :title="p.name"
                        class="size-7 border-2"
                        :style="{ background: p.hex, borderColor: accent === p.hex ? '#fff' : 'transparent', boxShadow: '0 0 10px ' + p.hex }"
                        @click="setAccent(p.hex)"></button>
                    <input type="color" :value="accent" class="h-8 w-10 cursor-pointer bg-transparent" @input="(e) => setAccent(e.target.value)" />
                </div>
            </SettingsItem>
        </SettingsGroup>
        <SettingsGroup id="nx-alarms" :title="t('view.settings.aurora.alarms')">
            <div class="flex flex-col gap-2">
                <div v-for="a in alarms" :key="a.id" class="flex items-center gap-2">
                    <Input v-model="a.time" type="time" class="w-28" />
                    <Input v-model="a.label" :placeholder="t('view.settings.aurora.alarm_label')" class="flex-1" maxlength="60" />
                    <span class="text-xs text-muted-foreground">{{ t('view.settings.aurora.alarm_daily') }}</span>
                    <Switch :model-value="a.daily" @update:modelValue="(v) => (a.daily = v)" />
                    <Switch :model-value="a.enabled" @update:modelValue="(v) => (a.enabled = v)" />
                    <Button size="sm" variant="outline" @click="removeAlarm(a.id)">x</Button>
                </div>
                <div class="flex gap-2">
                    <Button size="sm" variant="outline" @click="addAlarm">+ {{ t('view.settings.aurora.alarm_add') }}</Button>
                    <Button size="sm" variant="outline" @click="ringAlarm">{{ t('view.settings.aurora.alarm_test') }}</Button>
                </div>
            </div>
        </SettingsGroup>
        <SettingsGroup id="nx-rules" :title="t('view.settings.aurora.rules')">
            <div class="flex flex-col gap-2">
                <p class="text-xs text-muted-foreground">{{ t('view.settings.aurora.rules_desc') }}</p>
                <label class="flex items-center gap-2 text-sm">
                    <span class="w-56">{{ t('view.settings.aurora.rules_enabled') }}</span>
                    <Switch :model-value="rules.enabled" @update:modelValue="(v) => { rules.enabled = v; saveRules(); }" />
                </label>
                <label class="flex items-center gap-2 text-sm">
                    <span class="w-56">{{ t('view.settings.aurora.rules_status') }}</span>
                    <select class="nx-sel" v-model="rules.status" @change="saveRules">
                        <option value="busy">Do Not Disturb</option>
                        <option value="ask me">Ask Me</option>
                        <option value="join me">Join Me</option>
                        <option value="active">Online</option>
                    </select>
                </label>
                <label class="flex items-center gap-2 text-sm">
                    <span class="w-56">{{ t('view.settings.aurora.rules_desc_label') }}</span>
                    <Input v-model="rules.desc" maxlength="32" class="flex-1" @change="saveRules" />
                </label>
                <label class="flex items-center gap-2 text-sm">
                    <span class="w-56">{{ t('view.settings.aurora.rules_restore') }}</span>
                    <Switch :model-value="rules.restore" @update:modelValue="(v) => { rules.restore = v; saveRules(); }" />
                </label>
                <div v-for="w in rules.ids" :key="w.id" class="flex items-center gap-2 text-sm">
                    <span class="flex-1">{{ w.name }}</span>
                    <Button size="sm" variant="outline" @click="removeWatched(w.id)">x</Button>
                </div>
                <div class="flex gap-2">
                    <Input v-model="watchName" :placeholder="t('view.settings.aurora.rules_add_ph')" class="flex-1" @keydown.enter="addWatchedByName" />
                    <Button size="sm" variant="outline" @click="addWatchedByName">+ {{ t('view.settings.aurora.rules_add') }}</Button>
                </div>
            </div>
        </SettingsGroup>
        <SettingsGroup id="nx-people" :title="t('view.settings.aurora.people')">
            <div class="flex flex-col gap-3">
                <p class="text-xs text-muted-foreground">{{ t('view.settings.aurora.people_desc') }}</p>
                <div v-for="r in personRules" :key="r.id" class="flex flex-col gap-2 border border-border p-3">
                    <div class="flex items-center gap-2">
                        <Input v-model="r.name" :placeholder="t('view.settings.aurora.people_name')" class="flex-1" @change="savePersonRules" />
                        <Input v-model="r.nickname" :placeholder="t('view.settings.aurora.people_nick')" class="flex-1" @change="savePersonRules" />
                        <Switch :model-value="r.enabled" @update:modelValue="(v) => { r.enabled = v; savePersonRules(); }" />
                        <Button size="sm" variant="outline" @click="removePersonRule(r.id)">x</Button>
                    </div>
                    <Input v-model="r.greeting" :placeholder="t('view.settings.aurora.people_greeting')" @change="savePersonRules" />
                    <div class="flex items-center gap-2">
                        <Input v-model="r.reminder" :placeholder="t('view.settings.aurora.people_reminder')" class="flex-1" @change="savePersonRules" />
                        <Input v-model.number="r.minutes" type="number" min="1" class="w-20" @change="savePersonRules" />
                        <span class="text-xs text-muted-foreground">min</span>
                        <span class="text-xs text-muted-foreground">{{ t('view.settings.aurora.people_escalate') }}</span>
                        <Switch :model-value="r.escalate" @update:modelValue="(v) => { r.escalate = v; savePersonRules(); }" />
                    </div>
                </div>
                <div>
                    <Button size="sm" variant="outline" @click="addPersonRule">+ {{ t('view.settings.aurora.people_add') }}</Button>
                </div>
            </div>
        </SettingsGroup>
        <SettingsGroup id="nx-companion" :title="t('view.settings.aurora.companion')">
            <SettingsItem
                :label="t('view.settings.aurora.companion')"
                :description="t('view.settings.aurora.companion_desc')"
                toggle>
                <Switch
                    :model-value="companionEnabled"
                    :ariaLabel="t('view.settings.aurora.companion')"
                    @update:modelValue="setCompanionEnabled" />
            </SettingsItem>
            <SettingsItem :label="t('view.settings.aurora.home')" :description="t('view.settings.aurora.home_desc')">
                <Select :model-value="companionHome" @update:modelValue="setCompanionHome">
                    <SelectTrigger size="sm">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="roam">{{ t('view.settings.aurora.home_roam') }}</SelectItem>
                        <SelectItem value="dock">{{ t('view.settings.aurora.home_dock') }}</SelectItem>
                    </SelectContent>
                </Select>
            </SettingsItem>
            <SettingsItem
                :label="t('view.settings.aurora.note_reminders')"
                :description="t('view.settings.aurora.note_reminders_desc')"
                toggle>
                <Switch
                    :model-value="noteReminders"
                    :ariaLabel="t('view.settings.aurora.note_reminders')"
                    @update:modelValue="setNoteReminders" />
            </SettingsItem>
        </SettingsGroup>
        <SettingsGroup id="nx-voice" :title="t('view.settings.aurora.header')">
            <SettingsItem
                :label="t('view.settings.aurora.enabled')"
                :description="t('view.settings.aurora.enabled_desc')"
                toggle>
                <Switch
                    :model-value="mascotVoiceEnabled"
                    :ariaLabel="t('view.settings.aurora.enabled')"
                    @update:modelValue="setMascotVoiceEnabled" />
            </SettingsItem>

            <SettingsItem :label="t('view.settings.aurora.voice')">
                <Select
                    :model-value="mascotVoice"
                    :disabled="!mascotVoiceEnabled"
                    :ariaLabel="t('view.settings.aurora.voice')"
                    @update:modelValue="setMascotVoice">
                    <SelectTrigger size="sm">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem v-for="v in VOICES" :key="v.id" :value="v.id">{{ v.label }}</SelectItem>
                    </SelectContent>
                </Select>
            </SettingsItem>

            <SettingsItem :label="t('view.settings.aurora.speed') + ' ' + mascotVoiceSpeed.toFixed(2) + 'x'">
                <Slider
                    class="w-48"
                    :model-value="[mascotVoiceSpeed]"
                    :min="0.7"
                    :max="1.4"
                    :step="0.05"
                    :disabled="!mascotVoiceEnabled"
                    @update:modelValue="(v) => setMascotVoiceSpeed(v[0])" />
            </SettingsItem>

            <SettingsItem :label="t('view.settings.aurora.volume') + ' ' + Math.round(mascotVoiceVolume * 100) + '%'">
                <Slider
                    class="w-48"
                    :model-value="[mascotVoiceVolume]"
                    :min="0"
                    :max="1"
                    :step="0.05"
                    :disabled="!mascotVoiceEnabled"
                    @update:modelValue="(v) => setMascotVoiceVolume(v[0])" />
            </SettingsItem>

            <SettingsItem :label="t('view.settings.aurora.fx_preset')">
                <Select
                    :model-value="mascotFxPreset"
                    :disabled="!mascotVoiceEnabled"
                    :ariaLabel="t('view.settings.aurora.fx_preset')"
                    @update:modelValue="setMascotFxPreset">
                    <SelectTrigger size="sm">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="clean">{{ t('view.settings.aurora.fx_clean') }}</SelectItem>
                        <SelectItem value="robot">{{ t('view.settings.aurora.fx_robot') }}</SelectItem>
                        <SelectItem value="glitchy">{{ t('view.settings.aurora.fx_glitchy') }}</SelectItem>
                        <SelectItem value="custom" disabled>{{ t('view.settings.aurora.fx_custom') }}</SelectItem>
                    </SelectContent>
                </Select>
            </SettingsItem>

            <SettingsItem
                v-for="s in fxSliders"
                :key="s.key"
                :label="t('view.settings.aurora.' + s.key) + ' ' + mascotFx[s.key]">
                <Slider
                    class="w-48"
                    :model-value="[mascotFx[s.key]]"
                    :min="s.min"
                    :max="s.max"
                    :step="s.step"
                    :disabled="!mascotVoiceEnabled"
                    @update:modelValue="(v) => setMascotFxValue(s.key, v[0])" />
            </SettingsItem>

            <SettingsItem :label="t('view.settings.aurora.pack')" :description="t('view.settings.aurora.pack_desc')">
                <div class="flex items-center gap-3">
                    <span class="text-xs text-muted-foreground">{{ pack.done }} / {{ pack.total }}</span>
                    <Button size="sm" variant="outline" :disabled="!mascotVoiceEnabled || pack.running" @click="startPack">
                        {{ pack.running ? t('view.settings.aurora.pack_running') : t('view.settings.aurora.pack_build') }}
                    </Button>
                </div>
            </SettingsItem>

            <SettingsItem :label="t('view.settings.aurora.test')">
                <Button size="sm" variant="outline" :disabled="!mascotVoiceEnabled || busy" @click="testVoice">
                    {{ t('view.settings.aurora.test') }}
                </Button>
            </SettingsItem>
        </SettingsGroup>

        <SettingsGroup id="nx-security" :title="t('view.settings.aurora.security.header')">
            <SettingsItem
                :label="t('view.settings.aurora.security.status')"
                :description="t('view.settings.aurora.security.desc')">
                <span class="text-sm" :class="appLockEnabled ? 'text-primary' : 'text-muted-foreground'">
                    {{ appLockEnabled ? t('view.settings.aurora.security.on') : t('view.settings.aurora.security.off') }}
                </span>
            </SettingsItem>

            <SettingsItem v-if="appLockEnabled" :label="t('view.settings.aurora.security.current_pin')">
                <Input v-model="currentPin" type="password" inputmode="numeric" maxlength="12" class="h-8 w-40" />
            </SettingsItem>
            <SettingsItem
                v-if="!appLockEnabled || changing"
                :label="t('view.settings.aurora.security.new_pin')"
                :description="t('view.settings.aurora.security.pin_rule')">
                <Input v-model="newPin" type="password" inputmode="numeric" maxlength="12" class="h-8 w-40" />
            </SettingsItem>

            <SettingsItem :label="t('view.settings.aurora.security.actions')">
                <div class="flex gap-2">
                    <Button v-if="!appLockEnabled" size="sm" :disabled="!isValidPin(newPin)" @click="enableLock">
                        {{ t('view.settings.aurora.security.enable') }}
                    </Button>
                    <template v-else>
                        <Button v-if="!changing" size="sm" variant="outline" @click="changing = true">
                            {{ t('view.settings.aurora.security.change') }}
                        </Button>
                        <Button v-else size="sm" :disabled="!isValidPin(newPin)" @click="changeLock">
                            {{ t('view.settings.aurora.security.save') }}
                        </Button>
                        <Button size="sm" variant="outline" :disabled="currentPin.length < 4" @click="disableLock">
                            {{ t('view.settings.aurora.security.disable') }}
                        </Button>
                        <Button size="sm" variant="outline" @click="lockNow">
                            {{ t('view.settings.aurora.security.lock_now') }}
                        </Button>
                    </template>
                </div>
            </SettingsItem>

            <SettingsItem
                v-if="appLockEnabled"
                :label="
                    t('view.settings.aurora.security.auto_lock') +
                    ' ' +
                    (autoLockMinutes === 0 ? t('view.settings.aurora.security.never') : autoLockMinutes + ' min')
                ">
                <Slider
                    class="w-48"
                    :model-value="[autoLockMinutes]"
                    :min="0"
                    :max="60"
                    :step="5"
                    @update:modelValue="(v) => setAutoLockMinutes(v[0])" />
            </SettingsItem>
        </SettingsGroup>

        <SettingsGroup id="nx-cleanup" :title="t('view.settings.aurora.cleanup.header')">
            <SettingsItem
                v-for="key in CLEANUP_KEYS"
                :key="key"
                :label="t('view.settings.aurora.cleanup.' + key)"
                :description="
                    counts[key] === undefined
                        ? t('view.settings.aurora.cleanup.' + key + '_desc')
                        : t('view.settings.aurora.cleanup.found', { n: counts[key] })
                "
                toggle>
                <Switch
                    :model-value="cleanupSelected.includes(key)"
                    :ariaLabel="t('view.settings.aurora.cleanup.' + key)"
                    @update:modelValue="(on) => toggleCleanup(key, on)" />
            </SettingsItem>

            <SettingsItem
                :label="t('view.settings.aurora.cleanup.keep_days') + ' ' + cleanupKeepDays + ' d'"
                :description="t('view.settings.aurora.cleanup.keep_days_desc')">
                <Slider
                    class="w-48"
                    :model-value="[cleanupKeepDays]"
                    :min="7"
                    :max="365"
                    :step="1"
                    @update:modelValue="(v) => setCleanupKeepDays(v[0])" />
            </SettingsItem>

            <SettingsItem
                :label="t('view.settings.aurora.cleanup.auto')"
                :description="t('view.settings.aurora.cleanup.auto_desc')"
                toggle>
                <Switch
                    :model-value="cleanupAuto"
                    :ariaLabel="t('view.settings.aurora.cleanup.auto')"
                    @update:modelValue="setCleanupAuto" />
            </SettingsItem>

            <SettingsItem :label="t('view.settings.aurora.cleanup.actions')">
                <div class="flex gap-2">
                    <Button size="sm" variant="outline" :disabled="cleaning" @click="checkSizes">
                        {{ t('view.settings.aurora.cleanup.check') }}
                    </Button>
                    <Button
                        size="sm"
                        :variant="confirming ? 'destructive' : 'default'"
                        :disabled="cleaning || cleanupSelected.length === 0"
                        @click="cleanNow">
                        {{ confirming ? t('view.settings.aurora.cleanup.confirm') : t('view.settings.aurora.cleanup.now') }}
                    </Button>
                </div>
            </SettingsItem>
        </SettingsGroup>
    </div>
</template>

<script setup>
    import { onMounted, ref } from 'vue';
    import {
        boopCode,
        boopsUnlocked,
        changeBoopsPassword,
        initBoopCode,
        initBoopsLock,
        lockBoops,
        saveBoopCode,
        sendBoopLine,
        tryUnlockBoops
    } from '@/services/auroraBoopCode';
    import { addPersonRule, initPersonRules, personRules, removePersonRule, savePersonRules } from '@/services/auroraPranks';
    import { addWatched, initStatusRules, removeWatched, rules, saveRules } from '@/services/auroraStatusRules';
    import { useFriendStore } from '@/stores';
    import { Button } from '@/components/ui/button';
    import { Input } from '@/components/ui/input';
    import { Switch } from '@/components/ui/switch';
    import {
        companionEnabled,
        companionHome,
        noteReminders,
        setCompanionEnabled,
        setCompanionHome,
        setNoteReminders
    } from '@/services/auroraCompanion';
    import {
        chatboxEnabled,
        chatboxInterval,
        chatboxNotify,
        chatboxPreview,
        chatboxTemplate,
        initChatbox,
        setChatboxEnabled,
        setChatboxInterval,
        setChatboxNotify,
        setChatboxTemplate
    } from '@/services/auroraChatbox';
    import { audioApps, audioDevices, mm, refreshAudioLists, setMm, toggleMicMute, toggleMusicMic } from '@/services/auroraMusicMic';
    import {
        addonVoice,
        initAddons,
        openAddonsFolder,
        refreshAddons,
        setAddonVoice,
        unlockAddon,
        visibleAddons
    } from '@/services/auroraAddons';
    import { character, characterList, prettyName, setCharacter } from '@/services/auroraCharacter';
    import { ACCENT_PRESETS, accent, setAccent } from '@/services/auroraAccent';
    import { addAlarm, alarms, removeAlarm, ringAlarm } from '@/services/auroraAlarms';
    import { buildVoicePack, pack } from '@/services/auroraLines';
    import { Slider } from '@/components/ui/slider';
    import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
    import { storeToRefs } from 'pinia';
    import { toast } from 'vue-sonner';
    import { useI18n } from 'vue-i18n';

    import { useAuroraSettingsStore } from '@/stores';
    import { speak, VOICES } from '@/services/auroraVoice';
    import { isValidPin } from '@/services/auroraSecurity';
    import { CLEANUP_KEYS, cleanCategories, countCategory } from '@/services/auroraCleanup';

    import AuroraMascot from '@/components/AuroraMascot.vue';
    import SettingsGroup from '../SettingsGroup.vue';
    import SettingsItem from '../SettingsItem.vue';

    const { t } = useI18n();
    const store = useAuroraSettingsStore();
    const { mascotVoiceEnabled, mascotVoice, mascotVoiceSpeed, mascotVoiceVolume, mascotFxPreset, mascotFx, appLockEnabled, autoLockMinutes, cleanupSelected, cleanupKeepDays, cleanupAuto } =
        storeToRefs(store);
    const {
        setMascotVoiceEnabled,
        setMascotVoice,
        setMascotVoiceSpeed,
        setMascotVoiceVolume,
        setMascotFxPreset,
        setMascotFxValue,
        setAutoLockMinutes,
        lockNow,
        toggleCleanup,
        setCleanupKeepDays,
        setCleanupAuto
    } = store;

    const counts = ref({});
    const cleaning = ref(false);
    const confirming = ref(false);
    let confirmTimer = null;

    async function checkSizes() {
        const next = {};
        for (const key of CLEANUP_KEYS) {
            next[key] = await countCategory(key, cleanupKeepDays.value);
        }
        counts.value = next;
    }
    async function cleanNow() {
        if (!confirming.value) {
            confirming.value = true; // second click confirms
            clearTimeout(confirmTimer);
            confirmTimer = setTimeout(() => (confirming.value = false), 5000);
            return;
        }
        confirming.value = false;
        cleaning.value = true;
        try {
            const removed = await cleanCategories(cleanupSelected.value, cleanupKeepDays.value);
            toast.success(t('view.settings.aurora.cleanup.done', { n: removed }));
            counts.value = {};
        } catch (err) {
            console.error(err);
            toast.error(t('view.settings.aurora.cleanup.failed'));
        } finally {
            cleaning.value = false;
        }
    }

    const currentPin = ref('');
    const newPin = ref('');
    const changing = ref(false);

    function resetPinFields() {
        currentPin.value = '';
        newPin.value = '';
        changing.value = false;
    }
    async function enableLock() {
        await store.setPin(newPin.value);
        resetPinFields();
        toast.success(t('view.settings.aurora.security.enabled_toast'));
    }
    async function changeLock() {
        if (await store.changePin(currentPin.value, newPin.value)) {
            toast.success(t('view.settings.aurora.security.changed_toast'));
            resetPinFields();
        } else {
            toast.error(t('view.settings.aurora.lock.wrong'));
        }
    }
    async function disableLock() {
        if (await store.removePin(currentPin.value)) {
            toast.success(t('view.settings.aurora.security.disabled_toast'));
            resetPinFields();
        } else {
            toast.error(t('view.settings.aurora.lock.wrong'));
        }
    }

    const fxSliders = [
        { key: 'bitDepth', min: 2, max: 16, step: 1 },
        { key: 'downsample', min: 1, max: 12, step: 1 },
        { key: 'ringHz', min: 0, max: 200, step: 5 },
        { key: 'ringMix', min: 0, max: 1, step: 0.05 },
        { key: 'glitch', min: 0, max: 0.5, step: 0.02 }
    ];

    const busy = ref(false);

    async function testVoice() {
        busy.value = true;
        try {
            await speak(t('view.settings.aurora.test_line'), {
                voice: mascotVoice.value,
                speed: mascotVoiceSpeed.value,
                volume: mascotVoiceVolume.value,
                fx: { ...mascotFx.value }
            });
        } catch (err) {
            console.error(err);
            toast.error(t('view.settings.aurora.error'));
        } finally {
            busy.value = false;
        }
    }

    const meters = [
        { key: 'micPeak', label: 'MIC' },
        { key: 'musicPeak', label: 'MUSIC' },
        { key: 'outPeak', label: 'OUT' }
    ];

    function startPack() {
        buildVoicePack({
            voice: mascotVoice.value,
            speed: mascotVoiceSpeed.value,
            fx: { ...mascotFx.value }
        });
    }

    const watchName = ref('');
    async function sendLine(i) {
        const q = String(boopCode.value.target || '').trim().toLowerCase();
        const hit = Array.from(friendStoreRef.friends.values()).find((f) => String(f.name || f.ref?.displayName || '').toLowerCase() === q);
        if (!hit) {
            toast.error(t('view.settings.aurora.rules_not_found'));
            return;
        }
        const err = await sendBoopLine(hit.id, i);
        if (err === 'passphrase') toast.error(t('view.settings.aurora.boops_need_pass'));
        else if (err === 'slow') toast.info(t('view.settings.aurora.boops_slow'));
        else if (err) toast.error(t('view.settings.aurora.boops_failed'));
        else toast.success(t('view.settings.aurora.boops_sent'));
    }
    const friendStoreRef = useFriendStore();
    const addonSecret = ref('');
    const addonSecretMsg = ref(t('view.settings.aurora.addons_secret_hint'));
    const newBoopPass = ref('');
    async function saveNewBoopPass() {
        if (await changeBoopsPassword(newBoopPass.value)) toast.success(t('view.settings.aurora.boops_pass_saved'));
        newBoopPass.value = '';
    }
    async function tryUnlockAddon() {
        // the same box also takes the password of the hidden boop tools
        const ok = (await tryUnlockBoops(addonSecret.value)) || (await unlockAddon(addonSecret.value));
        addonSecret.value = '';
        addonSecretMsg.value = t(ok ? 'view.settings.aurora.addons_secret_ok' : 'view.settings.aurora.addons_secret_no');
    }
    function addWatchedByName() {
        const q = watchName.value.trim().toLowerCase();
        if (!q) return;
        const hit = Array.from(friendStoreRef.friends.values()).find((f) => String(f.name || f.ref?.displayName || '').toLowerCase() === q);
        if (!hit) {
            toast.error(t('view.settings.aurora.rules_not_found'));
            return;
        }
        addWatched(hit.id, hit.name || hit.ref?.displayName);
        watchName.value = '';
    }
    onMounted(() => {
        initStatusRules();
        initPersonRules();
        initBoopCode();
        initAddons();
        initBoopsLock();
        refreshAudioLists();
        initChatbox();
    });
</script>

<style scoped>
.nx-troll {
    min-height: 56px;
    padding: 10px 14px;
    font-size: 13px;
    font-weight: 700;
    text-align: left;
    color: var(--foreground);
    background: var(--card);
    border: 1px solid var(--primary);
    clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px));
    transition: background-color 0.12s ease, color 0.12s ease;
}
.nx-troll:hover {
    background: var(--primary);
    color: var(--primary-foreground);
}
.nx-troll:active {
    transform: scale(0.98);
}
.nx-sel {
    flex: 1;
    min-width: 0;
    height: 2rem;
    padding: 0 0.5rem;
    color: var(--foreground);
    background: var(--card);
    border: 1px solid var(--border);
}
</style>
