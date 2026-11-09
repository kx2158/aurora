<template>
    <div id="x-app" class="flex w-screen h-screen overflow-hidden cursor-default x-app-type">
        <div class="wrist" :class="{ background: config && config.backgroundEnabled }">
            <!-- the round wrist: stacked layers at different depths, tilted, with bloom on the bright parts -->
            <div
                ref="wristStage"
                class="vr-stage"
                :class="[wristPhase, { glitch: glitchOn, hiss: neonState.mm && neonState.mmMuted }]"
                :style="noiseStyle">
                <!-- layer 0: the glass face -->
                <svg class="vr-hud vr-l0" viewBox="0 0 510 510" aria-hidden="true">
                    <defs>
                        <pattern id="vr-scan" width="4" height="3" patternUnits="userSpaceOnUse">
                            <rect width="4" height="1" fill="#fff" opacity="0.035" />
                        </pattern>
                        <radialGradient id="vr-glow" cx="46%" cy="40%" r="62%">
                            <stop offset="0%" stop-color="#202328" />
                            <stop offset="62%" stop-color="#0f1013" />
                            <stop offset="100%" stop-color="#050506" />
                        </radialGradient>
                        <radialGradient id="vr-rim" cx="50%" cy="50%" r="50%">
                            <stop offset="88%" stop-color="#000" stop-opacity="0" />
                            <stop offset="96%" stop-color="#000" stop-opacity="0.55" />
                            <stop offset="100%" stop-color="#000" stop-opacity="0.9" />
                        </radialGradient>
                        <linearGradient id="vr-bezel" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stop-color="#fff" stop-opacity="0.55" />
                            <stop offset="45%" stop-color="#fff" stop-opacity="0.06" />
                            <stop offset="100%" stop-color="#fff" stop-opacity="0.3" />
                        </linearGradient>
                        <!-- bloom: the shape, plus a tight and a wide blur of itself on top -->
                        <filter id="vr-bloom" x="-60%" y="-60%" width="220%" height="220%">
                            <feGaussianBlur in="SourceGraphic" stdDeviation="2.2" result="near" />
                            <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="far" />
                            <feMerge>
                                <feMergeNode in="far" />
                                <feMergeNode in="near" />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>
                        <path id="vr-arc-top" d="M 63 255 A 192 192 0 0 1 447 255" />
                        <path id="vr-arc-bottom" d="M 45 255 A 210 210 0 0 0 465 255" />
                    </defs>
                    <circle cx="255" cy="255" r="253" class="hud-face" />
                    <circle cx="255" cy="255" r="253" fill="url(#vr-scan)" />
                    <circle cx="255" cy="255" r="253" fill="url(#vr-rim)" />
                    <circle cx="255" cy="255" r="251.5" class="hud-bezel" />
                    <circle cx="255" cy="255" r="226" class="hud-ring faint" />
                    <circle cx="255" cy="255" r="160" class="hud-ring faint" />
                    <circle cx="255" cy="255" r="10" class="hud-shock" />
                </svg>
                <!-- layer 1: the tick ring, the arcs and the hands -->
                <svg class="vr-hud vr-l1" viewBox="0 0 510 510" aria-hidden="true">
                    <circle cx="255" cy="255" r="246" class="hud-ring" />
                    <circle cx="255" cy="255" r="172" class="hud-ring faint dashed" />
                    <g class="hud-ticks">
                        <g v-for="i in 120" :key="`t${i}`" :transform="`rotate(${i * 3} 255 255)`">
                            <line
                                x1="255"
                                :y1="i % 10 === 0 ? 10 : i % 2 === 0 ? 15 : 18"
                                x2="255"
                                y2="22"
                                :class="i % 10 === 0 ? 'hud-tick big' : 'hud-tick'"
                                :style="{ '--i': i }" />
                        </g>
                    </g>
                    <g class="hud-bright">
                        <!-- the minute fills the inner ring, the second runs round the outside -->
                        <path :d="arcPath(226, 0, clock.ma)" class="hud-arc" />
                        <path :d="arcPath(172, 0, clock.ha)" class="hud-arc dim" />
                        <g :transform="`rotate(${clock.ma} 255 255)`">
                            <path d="M 255 32 l -5 -8 h 10 Z" class="hud-mark" />
                        </g>
                        <g :transform="`rotate(${clock.ha} 255 255)`">
                            <line x1="255" y1="88" x2="255" y2="100" class="hud-hour" />
                        </g>
                        <circle cx="255" cy="16" r="4" class="hud-sec" :transform="`rotate(${clock.sa} 255 255)`" />
                    </g>
                </svg>
                <!-- layer 2: gauges and the text round the edge -->
                <svg class="vr-hud vr-l2" viewBox="0 0 510 510" aria-hidden="true">
                    <!-- side gauges: mic volume on the left, people here on the right -->
                    <path
                        v-for="g in 16"
                        :key="`l${g}`"
                        :d="arcPath(200, 296 - g * 4.4, 296 - g * 4.4 + 3.2)"
                        class="hud-seg"
                        :style="{ '--i': g }"
                        :class="{ on: neonState.mm && !neonState.mmMuted && g <= Math.round((neonState.mmVol / 100) * 16) }" />
                    <path
                        v-for="g in 16"
                        :key="`r${g}`"
                        :d="arcPath(200, 64 + g * 4.4 - 3.2, 64 + g * 4.4)"
                        class="hud-seg"
                        :style="{ '--i': g }"
                        :class="{ on: g <= Math.min(16, lastLocation.playerList.length) }" />
                    <text class="hud-small" x="84" y="259">{{ neonState.mm ? (neonState.mmMuted ? 'mute' : 'mic') : 'off' }}</text>
                    <text class="hud-small" x="426" y="259">{{ lastLocation.playerList.length }}</text>
                    <text class="hud-curve">
                        <textPath href="#vr-arc-top" startOffset="50%">{{ topLine }}</textPath>
                    </text>
                    <text class="hud-curve low">
                        <textPath href="#vr-arc-bottom" startOffset="50%">{{ bottomLine }}</textPath>
                    </text>
                </svg>
                <!-- the glitch layer: static on the glass, and bars that tear across it now and then -->
                <div class="vr-glitch" aria-hidden="true">
                    <i v-for="b in glitchBars" :key="b.id" :style="{ top: `${b.top}px`, height: `${b.h}px`, '--dx': `${b.dx}px` }"></i>
                </div>
                <!-- layer 3: the time, floating highest -->
                <div class="vr-core">
                    <div v-if="alarmBanner" class="vr-alarm">
                        <AuroraIcon name="alarm" :size="14" /> {{ alarmBanner.time }} {{ alarmBanner.label }}
                    </div>
                    <div v-else-if="neonState.watchAlert" class="vr-alarm vr-watch">
                        <AuroraIcon name="shield" :size="14" />
                        <span class="vr-watch-text">{{ neonState.watchAlert.name }} / {{ neonState.watchAlert.text }}</span>
                    </div>
                    <span v-else class="vr-layer">layer {{ clock.layer }}<span class="vr-blink">_</span></span>
                    <span class="vr-digits">{{ clock.hm }}<small>{{ clock.sec }}</small></span>
                    <span class="vr-date">{{ clock.day }} / {{ clock.date }}</span>
                    <div v-if="neonState.song" class="vr-now">
                        <span class="vr-eq" :class="{ live: neonState.playing }"><i></i><i></i><i></i><i></i></span>
                        <span class="vr-now-text">{{ musicLine }}</span>
                    </div>
                </div>
                <div class="x-container vr-ring-feed">
                    <div class="x-friend-list" ref="list" style="color: var(--vr-text-secondary)">
                        <template v-if="config && config.minimalFeed">
                            <template
                                v-for="(feed, index) in wristFeed"
                                :key="`minimal-${index}-${feed.type}-${feed.created_at}`">
                                <div
                                    v-if="feed.type === 'GPS'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra flex items-center">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <span class="name" v-text="feed.displayName"></span>
                                            <Loader2 v-if="feed.isTraveling" class="is-loading ml-2 h-4 w-4" />
                                            <VrLocation
                                                :location="feed.location"
                                                :hint="feed.worldName"
                                                :grouphint="feed.groupName"
                                                :instancedisplayname="feed.instanceDisplayName"
                                                style="margin-left: 2px"></VrLocation>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'Offline'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra flex items-center">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <span class="name" v-text="feed.displayName"></span>
                                            <X class="h-5 w-5" />
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'Online'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra flex items-center">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <span class="name" v-text="feed.displayName"></span>
                                            <Check class="h-5 w-5" />
                                            <template v-if="feed.worldName">
                                                <VrLocation
                                                    :location="feed.location"
                                                    :hint="feed.worldName"
                                                    :grouphint="feed.groupName"
                                                    :instancedisplayname="feed.instanceDisplayName"
                                                    style="margin-left: 5px"></VrLocation>
                                            </template>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'Status'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra flex items-center">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <span class="name" v-text="feed.displayName" style="margin-right: 5px"></span>
                                            <template v-if="feed.statusDescription === feed.previousStatusDescription">
                                                <i class="x-user-status" :class="statusClass(feed.previousStatus)"></i>
                                                <ArrowRight class="h-4 w-4 inline-block" />
                                                <i class="x-user-status" :class="statusClass(feed.status)"></i>
                                            </template>
                                            <template v-else>
                                                <i class="x-user-status" :class="statusClass(feed.status)"></i>
                                                {{ feed.statusDescription }}
                                            </template>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'OnPlayerJoined'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra flex items-center">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <Play class="mr-5 h-5 w-5" />
                                            <span
                                                class="name"
                                                v-text="feed.displayName"
                                                :style="{ color: feed.tagColour }"></span>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'OnPlayerLeft'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra flex items-center">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <Play class="mr-5 h-5 w-5 rotate-180" />
                                            <span
                                                class="name"
                                                v-text="feed.displayName"
                                                :style="{ color: feed.tagColour }"></span>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'OnPlayerJoining'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra flex items-center">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <Play class="h-5 w-5" />
                                            <Loader2 class="is-loading mr-5 h-4 w-4" />
                                            <span class="name" v-text="feed.displayName"></span>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'Location'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra flex items-center">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <VrLocation
                                                :location="feed.location"
                                                :hint="feed.worldName"
                                                :grouphint="feed.groupName"
                                                :instancedisplayname="feed.instanceDisplayName"></VrLocation>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'VideoPlay'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra flex items-center">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <TvMinimalPlay class="mr-5 h-5 w-5" />
                                            <span
                                                v-if="feed.displayName"
                                                class="name"
                                                v-text="feed.displayName"
                                                style="margin-right: 5px"
                                                :style="{ color: feed.tagColour }"></span>
                                            <template v-if="feed.videoName">
                                                <span v-text="feed.videoName"></span>
                                            </template>
                                            <template v-else>
                                                <span v-text="feed.videoUrl"></span>
                                            </template>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'invite'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra flex items-center">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <Send class="mr-5 h-5 w-5" />
                                            <span class="name mr-5" v-text="feed.senderUsername"></span>
                                            <VrLocation
                                                :location="feed.details.worldId"
                                                :hint="feed.details.worldName"
                                                :instancedisplayname="feed.instanceDisplayName"></VrLocation>
                                            <span v-text="feed.details.inviteMessage"></span>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'requestInvite'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra flex items-center">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <Send class="mr-5 h-5 w-5" />
                                            <span class="name mr-5" v-text="feed.senderUsername"></span>
                                            <span v-text="feed.details.requestMessage"></span>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'inviteResponse'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra flex items-center">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <Send class="mr-5 h-5 w-5" />
                                            <span class="name mr-5" v-text="feed.senderUsername"></span>
                                            <span v-text="feed.details.responseMessage"></span>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'requestInviteResponse'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra flex items-center">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <Send class="mr-5 h-5 w-5" />
                                            <span class="name mr-5" v-text="feed.senderUsername"></span>
                                            <span v-text="feed.details.responseMessage"></span>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'friendRequest'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra flex items-center">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <HeartPlus class="mr-5 h-5 w-5" />
                                            <span class="name" v-text="feed.senderUsername"></span>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'Friend'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra flex items-center">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <Heart class="mr-5 h-5 w-5" />
                                            <span class="name" v-text="feed.displayName"></span>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'Unfriend'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra flex items-center">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <ThumbsDown class="mr-5 h-5 w-5" />
                                            <span class="name" v-text="feed.displayName"></span>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'DisplayName'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra flex items-center">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <Pencil class="mr-5 h-5 w-5" />
                                            <span class="name" v-text="feed.previousDisplayName"></span>
                                            <ArrowRight class="mr-5 h-4 w-4 inline-block" />
                                            <span class="name" v-text="feed.displayName"></span>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'TrustLevel'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra flex items-center">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <GraduationCap class="mr-5 h-5 w-5" />
                                            <span class="name" v-text="feed.displayName"></span>
                                            {{ feed.previousTrustLevel }}
                                            <ArrowRight class="mx-1 inline-block h-4 w-4" />
                                            {{ feed.trustLevel }}
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'boop'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra flex items-center">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <HeartHandshake class="mr-5 h-5 w-5" />
                                            <span class="name mr-5" v-text="feed.senderUsername"></span>
                                            <span v-text="feed.message"></span>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'groupChange'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra flex items-center">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <Tag class="mr-5 h-5 w-5" />
                                            <span class="name mr-5" v-text="feed.senderUsername"></span>
                                            <span v-text="feed.message"></span>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'group.announcement'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra flex items-center">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <Megaphone class="mr-5 h-5 w-5" />
                                            <span class="name" v-text="feed.message"></span>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'group.event.created'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra flex items-center">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <CalendarPlus class="mr-5 h-5 w-5" />
                                            <span class="name" v-text="feed.message"></span>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'group.event.starting'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra flex items-center">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <CalendarCheck class="mr-5 h-5 w-5" />
                                            <span class="name" v-text="feed.message"></span>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'group.informative'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra flex items-center">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <Megaphone class="mr-5 h-5 w-5" />
                                            <span class="name" v-text="feed.message"></span>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'group.invite'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra flex items-center">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <Tag class="mr-5 h-5 w-5" />
                                            <span class="name" v-text="feed.message"></span>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'group.joinRequest'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra flex items-center">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <Tag class="mr-5 h-5 w-5" />
                                            <span class="name" v-text="feed.message"></span>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'group.transfer'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra flex items-center">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <Tag class="mr-5 h-5 w-5" />
                                            <span class="name" v-text="feed.message"></span>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'group.queueReady'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra flex items-center">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <Send class="mr-5 h-5 w-5" />
                                            <span class="name" v-text="feed.message"></span>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'instance.closed'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra flex items-center">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <XCircle class="mr-5 h-5 w-5" />
                                            <span class="name" v-text="feed.message"></span>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'PortalSpawn'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra flex items-center">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <template v-if="feed.displayName">
                                                <Music class="mr-5 h-5 w-5" />
                                                <span
                                                    class="name mr-5"
                                                    v-text="feed.displayName"
                                                    :style="{ color: feed.tagColour }"></span>
                                                <VrLocation
                                                    :location="feed.instanceId"
                                                    :hint="feed.worldName"
                                                    :grouphint="feed.groupName"></VrLocation>
                                            </template>
                                            <template v-else>
                                                <Music class="mr-1 h-5 w-5 inline-block" /> User has spawned a portal
                                            </template>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'AvatarChange'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra flex items-center">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <Footprints class="mr-5 h-5 w-5" />
                                            <span
                                                class="name mr-5"
                                                v-text="feed.displayName"
                                                :style="{ color: feed.tagColour }"></span>
                                            <template v-if="feed.releaseStatus === 'public'">
                                                <i class="x-user-status online"></i>&nbsp;
                                            </template>
                                            <template v-else-if="feed.releaseStatus === 'private'">
                                                <i class="x-user-status askme"></i>&nbsp;
                                            </template>
                                            {{ feed.name }}
                                            <template v-if="feed.description && feed.description !== feed.name">
                                                - {{ feed.description }}
                                            </template>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'ChatBoxMessage'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra flex items-center">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <MessageSquare class="mr-5 h-5 w-5" />
                                            <span
                                                class="name"
                                                v-text="feed.displayName"
                                                :style="{ color: feed.tagColour }"></span>
                                            <span v-text="feed.text"></span>
                                        </span>
                                    </div>
                                </div>
                                <div v-else-if="feed.type === 'Event'" class="x-friend-item">
                                    <div class="detail">
                                        <span class="extra flex items-center">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <AlertTriangle class="mr-5 h-5 w-5" />
                                            <span class="name" v-text="feed.data"></span>
                                        </span>
                                    </div>
                                </div>
                                <div v-else-if="feed.type === 'External'" class="x-friend-item">
                                    <div class="detail">
                                        <span class="extra flex items-center">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <Info class="mr-5 h-5 w-5" />
                                            <span
                                                class="name mr-5"
                                                v-text="feed.displayName"
                                                :style="{ color: feed.tagColour }"></span>
                                            <span class="name" v-text="feed.message"></span>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'BlockedOnPlayerJoined'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra flex items-center">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <Play class="mr-1 h-5 w-5 inline-block" /><Ban class="mr-5 h-5 w-5" />
                                            <span class="name" v-text="feed.displayName"></span>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'BlockedOnPlayerLeft'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra flex items-center">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <Play class="mr-1 inline-block h-5 w-5 rotate-180" /><Ban
                                                class="mr-5 h-5 w-5" />
                                            <span class="name" v-text="feed.displayName"></span>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'MutedOnPlayerJoined'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra flex items-center">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <Play class="mr-1 h-5 w-5 inline-block" /><VolumeX class="mr-5 h-5 w-5" />
                                            <span class="name" v-text="feed.displayName"></span>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'MutedOnPlayerLeft'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra flex items-center">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <Play class="mr-1 inline-block h-5 w-5 rotate-180" /><VolumeX
                                                class="mr-5 h-5 w-5" />
                                            <span class="name" v-text="feed.displayName"></span>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'Blocked'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra flex items-center">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <Ban class="mr-5 h-5 w-5" />
                                            <span
                                                class="name"
                                                v-text="feed.displayName"
                                                :style="{ color: feed.tagColour }"></span>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'Unblocked'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra flex items-center">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <Circle class="mr-5 h-5 w-5" />
                                            <span
                                                class="name"
                                                v-text="feed.displayName"
                                                :style="{ color: feed.tagColour }"></span>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'Muted'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra flex items-center">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <VolumeX class="mr-5 h-5 w-5" />
                                            <span
                                                class="name"
                                                v-text="feed.displayName"
                                                :style="{ color: feed.tagColour }"></span>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'Unmuted'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra flex items-center">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <Volume2 class="mr-5 h-5 w-5" />
                                            <span
                                                class="name"
                                                v-text="feed.displayName"
                                                :style="{ color: feed.tagColour }"></span>
                                        </span>
                                    </div>
                                </div>
                            </template>
                        </template>
                        <template v-else>
                            <template
                                v-for="(feed, index) in wristFeed"
                                :key="`full-${index}-${feed.type}-${feed.created_at}`">
                                <div
                                    v-if="feed.type === 'GPS'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra flex items-center">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <template v-if="feed.isTraveling">
                                                <span class="name" v-text="feed.displayName"></span> is traveling to
                                                <VrLocation
                                                    :location="feed.location"
                                                    :hint="feed.worldName"
                                                    :grouphint="feed.groupName"
                                                    :instancedisplayname="feed.instanceDisplayName"></VrLocation>
                                            </template>
                                            <template v-else>
                                                <span class="name" v-text="feed.displayName"></span> is in
                                                <VrLocation
                                                    :location="feed.location"
                                                    :hint="feed.worldName"
                                                    :grouphint="feed.groupName"
                                                    :instancedisplayname="feed.instanceDisplayName"></VrLocation>
                                            </template>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'Offline'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <span class="name" v-text="feed.displayName"></span> has logged out
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'Online'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra flex items-center">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <span class="name" v-text="feed.displayName"></span>
                                            <span class="vr-mx">has logged in</span>
                                            <template v-if="feed.worldName">
                                                to
                                                <VrLocation
                                                    :location="feed.location"
                                                    :hint="feed.worldName"
                                                    :grouphint="feed.groupName"
                                                    :instancedisplayname="feed.instanceDisplayName"></VrLocation>
                                            </template>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'Status'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra flex items-center">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <span class="name" v-text="feed.displayName" style="margin-right: 5px"></span>
                                            <template v-if="feed.statusDescription === feed.previousStatusDescription">
                                                <i class="x-user-status" :class="statusClass(feed.previousStatus)"></i>
                                                <ArrowRight class="inline-block h-4 w-4" />
                                                <i class="x-user-status" :class="statusClass(feed.status)"></i>
                                            </template>
                                            <template v-else>
                                                <i class="x-user-status" :class="statusClass(feed.status)"></i>
                                                {{ feed.statusDescription }}
                                            </template>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'OnPlayerJoined'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <span
                                                class="name"
                                                v-text="feed.displayName"
                                                :style="{ color: feed.tagColour }"></span>
                                            has joined
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'OnPlayerLeft'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <span
                                                class="name"
                                                v-text="feed.displayName"
                                                :style="{ color: feed.tagColour }"></span>
                                            has left
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'OnPlayerJoining'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <span class="name" v-text="feed.displayName"></span> is joining
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'Location'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra flex items-center">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <VrLocation
                                                :location="feed.location"
                                                :hint="feed.worldName"
                                                :grouphint="feed.groupName"
                                                :instancedisplayname="feed.instanceDisplayName"></VrLocation>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'VideoPlay'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <span
                                                class="name"
                                                v-text="feed.displayName"
                                                :style="{ color: feed.tagColour }"></span>
                                            <span class="vr-mx">changed video to</span>
                                            <template v-if="feed.videoName">
                                                <span v-text="feed.videoName"></span>
                                            </template>
                                            <template v-else>
                                                <span v-text="feed.videoUrl"></span>
                                            </template>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'invite'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra flex items-center">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <span class="name" v-text="feed.senderUsername"></span> has invited you to
                                            <VrLocation
                                                :location="feed.details.worldId"
                                                :hint="feed.details.worldName"
                                                :instancedisplayname="feed.instanceDisplayName"></VrLocation>
                                            <span v-text="feed.details.inviteMessage"></span>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'requestInvite'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <span class="name" v-text="feed.senderUsername"></span> has requested an invite
                                            <span v-text="feed.details.requestMessage"></span>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'inviteResponse'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <span class="name" v-text="feed.senderUsername"></span> has responded to your
                                            invite <span v-text="feed.details.responseMessage"></span>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'requestInviteResponse'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <span class="name" v-text="feed.senderUsername"></span> has responded to your
                                            invite request <span v-text="feed.details.responseMessage"></span>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'friendRequest'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <span class="name" v-text="feed.senderUsername"></span> has sent you a friend
                                            request
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'Friend'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <span class="name" v-text="feed.displayName"></span> is now your friend
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'Unfriend'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <span class="name" v-text="feed.displayName"></span> is no longer your friend
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'DisplayName'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <span class="name" v-text="feed.previousDisplayName"></span> changed their name
                                            to <span class="name" v-text="feed.displayName"></span>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'TrustLevel'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <span class="name" v-text="feed.displayName"></span> trust level is now
                                            {{ feed.trustLevel }}
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'boop'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <span class="name" v-text="feed.senderUsername"></span>
                                            <span v-text="feed.message"></span>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'groupChange'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <span class="name" v-text="feed.senderUsername"></span>
                                            <span v-text="feed.message"></span>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'group.announcement'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <span class="name" v-text="feed.message"></span>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'group.event.created'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra flex items-center">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <CalendarPlus class="mr-5 h-5 w-5" />
                                            <span class="name" v-text="feed.message"></span>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'group.event.starting'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra flex items-center">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <Clock class="mr-5 h-5 w-5" />
                                            <span class="name" v-text="feed.message"></span>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'group.informative'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <span class="name" v-text="feed.message"></span>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'group.invite'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <span class="name" v-text="feed.message"></span>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'group.joinRequest'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <span class="name" v-text="feed.message"></span>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'group.transfer'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <span class="name" v-text="feed.message"></span>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'group.queueReady'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <span class="name" v-text="feed.message"></span>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'instance.closed'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <span class="name" v-text="feed.message"></span>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'PortalSpawn'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra flex items-center">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <template v-if="feed.displayName">
                                                <span
                                                    class="name"
                                                    v-text="feed.displayName"
                                                    :style="{ color: feed.tagColour }"></span>
                                                has spawned a portal to
                                                <VrLocation
                                                    :location="feed.instanceId"
                                                    :hint="feed.worldName"
                                                    :grouphint="feed.groupName"
                                                    style="margin-left: 5px"></VrLocation>
                                            </template>
                                            <template v-else> User has spawned a portal </template>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'AvatarChange'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <span
                                                class="name"
                                                v-text="feed.displayName"
                                                :style="{ color: feed.tagColour }"></span>
                                            <span class="vr-mx">changed into avatar</span>
                                            <template v-if="feed.releaseStatus === 'public'">
                                                <i class="x-user-status online"></i>
                                            </template>
                                            <template v-else>
                                                <i class="x-user-status askme"></i>
                                            </template>
                                            {{ feed.name }}
                                            <template v-if="feed.description && feed.description !== feed.name">
                                                - {{ feed.description }}
                                            </template>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'ChatBoxMessage'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <span
                                                class="name"
                                                v-text="feed.displayName"
                                                :style="{ color: feed.tagColour }"></span>
                                            said <span v-text="feed.text"></span>
                                        </span>
                                    </div>
                                </div>
                                <div v-else-if="feed.type === 'Event'" class="x-friend-item">
                                    <div class="detail">
                                        <span class="extra">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            Event: <span class="name" v-text="feed.data"></span>
                                        </span>
                                    </div>
                                </div>
                                <div v-else-if="feed.type === 'External'" class="x-friend-item">
                                    <div class="detail">
                                        <span class="extra">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            External:
                                            <span
                                                class="name"
                                                v-text="feed.displayName"
                                                :style="{ color: feed.tagColour }"></span>
                                            <span class="name" v-text="feed.message"></span>
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'BlockedOnPlayerJoined'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            Blocked user <span class="name" v-text="feed.displayName"></span> has joined
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'BlockedOnPlayerLeft'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            Blocked user <span class="name" v-text="feed.displayName"></span> has left
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'MutedOnPlayerJoined'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            Muted user <span class="name" v-text="feed.displayName"></span> has joined
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'MutedOnPlayerLeft'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            Muted user <span class="name" v-text="feed.displayName"></span> has left
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'Blocked'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <span
                                                class="name"
                                                v-text="feed.displayName"
                                                :style="{ color: feed.tagColour }"></span>
                                            has blocked you
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'Unblocked'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <span
                                                class="name"
                                                v-text="feed.displayName"
                                                :style="{ color: feed.tagColour }"></span>
                                            has unblocked you
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'Muted'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <span
                                                class="name"
                                                v-text="feed.displayName"
                                                :style="{ color: feed.tagColour }"></span>
                                            has muted you
                                        </span>
                                    </div>
                                </div>
                                <div
                                    v-else-if="feed.type === 'Unmuted'"
                                    class="x-friend-item"
                                    :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                                    <div class="detail">
                                        <span class="extra">
                                            <span class="time">{{ formatDate(feed.created_at) }}</span>
                                            <span
                                                class="name"
                                                v-text="feed.displayName"
                                                :style="{ color: feed.tagColour }"></span>
                                            has unmuted you
                                        </span>
                                    </div>
                                </div>
                            </template>
                        </template>
                    </div>
                </div>
                <!-- the glass on top: a moving highlight, and the scan line that runs once on open -->
                <div class="vr-glass"></div>
                <div class="vr-scanline"></div>
            </div>
        </div>
        <!-- Aurora SteamVR dashboard: big buttons for the laser pointer -->
        <div class="vr-dash">
            <div class="vr-dash-head">
                <AuroraLogo :size="44" />
                <span class="vr-dash-name">aurora</span>
                <span class="vr-dash-clock">{{ clock.hm }}</span>
            </div>
            <div class="vr-dash-sub">
                <span>{{ clock.day }}, {{ clock.date }}</span>
                <span v-if="neonState.nextAlarm">Next alarm {{ neonState.nextAlarm }}</span>
            </div>
            <div v-for="g in dashGroups" :key="g.title" class="vr-group">
                <div class="vr-group-title">{{ g.title }}</div>
                <div class="vr-grid">
                    <button
                        v-for="b in g.buttons"
                        :key="b.cmd"
                        type="button"
                        class="vr-tile"
                        :class="{ on: b.on, warn: b.warn }"
                        @click="dashPress(b.cmd)">
                        <AuroraIcon :name="b.icon" :size="34" :stroke="1.8" />
                        <span class="vr-tile-label">{{ b.label }}</span>
                        <span v-if="b.state !== undefined" class="vr-tile-state">{{ b.state }}</span>
                    </button>
                </div>
            </div>
            <div class="vr-music">
                <button type="button" class="vr-mbtn" aria-label="Previous" @click="dashPress('mPrev')">
                    <AuroraIcon name="prev" :size="34" />
                </button>
                <button type="button" class="vr-mbtn big" aria-label="Play or pause" @click="dashPress('mPlay')">
                    <AuroraIcon name="playpause" :size="38" />
                </button>
                <button type="button" class="vr-mbtn" aria-label="Next" @click="dashPress('mNext')">
                    <AuroraIcon name="next" :size="34" />
                </button>
                <div class="vr-music-text">
                    <span class="vr-eq" :class="{ live: neonState.playing }"><i></i><i></i><i></i><i></i></span>
                    <span class="vr-music-title">{{ musicLine }}</span>
                </div>
            </div>
            <div class="vr-bubble">{{ neonState.preview || 'The chatbox is empty' }}</div>
        </div>
        <!-- HMD Overlay -->
        <div class="hmd">
            <svg class="np-progress-circle">
                <circle
                    class="np-progress-circle-stroke"
                    cx="60"
                    cy="60"
                    stroke="white"
                    r="30"
                    fill="transparent"
                    stroke-width="60"></circle>
            </svg>
            <div class="hud-feed">
                <div v-for="(feed, index) in hudFeed" :key="`hud-${index}-${feed.displayName}-${feed.time}`">
                    <div class="item" :class="{ friend: feed.isFriend, favorite: feed.isFavorite }">
                        <span v-if="feed.isMaster">👑</span><span v-if="feed.isModerator">⚔️</span
                        ><strong class="name" v-text="feed.displayName" :style="{ color: feed.colour }"></strong>
                        <template v-if="feed.type === 'ChangeAvatar'">
                            <span style="margin-left: 10px; color: var(--vr-text-secondary)">ChangeAvatar</span>
                            <span v-if="!feed.inCache" style="color: var(--vr-text-muted); margin-left: 10px"
                                ><Loader2 class="is-loading inline-block h-4 w-4" />
                            </span>
                            <span v-text="feed.avatar.name" style="margin-left: 10px"></span>
                            <span
                                v-if="feed.avatar.releaseStatus === 'public'"
                                style="margin-left: 10px; color: var(--status-online)"
                                >(Public)</span
                            >
                            <span
                                v-else-if="feed.avatar.releaseStatus === 'private'"
                                style="margin-left: 10px; color: var(--status-askme)"
                                >(Private)</span
                            >
                        </template>
                        <template v-else-if="feed.type === 'ChangeStatus'">
                            <span style="margin-left: 10px; color: var(--vr-text-secondary)">ChangeStatus</span>
                            <span v-if="feed.status !== feed.previousStatus">
                                <i
                                    class="x-user-status"
                                    :class="statusClass(feed.previousStatus)"
                                    style="margin-left: 10px; width: 20px; height: 20px"></i>
                                <span>
                                    <ArrowRight class="mx-1 inline-block h-4 w-4" />
                                </span>
                                <i
                                    class="x-user-status"
                                    :class="statusClass(feed.status)"
                                    style="width: 20px; height: 20px"></i>
                            </span>
                            <span
                                v-if="feed.statusDescription !== feed.previousStatusDescription"
                                v-text="feed.statusDescription"
                                style="margin-left: 10px"></span>
                        </template>
                        <template v-else-if="feed.type === 'ChangeGroup'">
                            <span style="margin-left: 10px; color: var(--vr-text-secondary)">ChangeGroup</span>
                            <span v-text="feed.groupName" style="margin-left: 10px"></span>
                        </template>
                        <template v-else-if="feed.type === 'ChatBoxMessage'">
                            <span style="margin-left: 10px; color: var(--vr-text-secondary)">ChatBox</span>
                            <span v-text="feed.text" style="margin-left: 10px; white-space: normal"></span>
                        </template>
                        <template v-else-if="feed.type === 'PortalSpawn'">
                            <span style="margin-left: 10px; color: var(--vr-text-secondary)">PortalSpawn</span>
                            <VrLocation
                                :location="feed.location"
                                :hint="feed.worldName"
                                :grouphint="feed.groupName"
                                :link="false"
                                style="margin-left: 10px"></VrLocation>
                        </template>
                        <template v-else-if="feed.type === 'OnPlayerJoined'">
                            <span style="margin-left: 10px; color: var(--vr-text-secondary)">has joined</span>
                            <span
                                v-if="feed.platform === 'Desktop'"
                                style="color: var(--status-joinme); margin-left: 10px"
                                >Desktop</span
                            >
                            <span
                                v-else-if="feed.platform === 'VR'"
                                style="color: var(--status-joinme); margin-left: 10px"
                                >VR</span
                            >
                            <span
                                v-else-if="feed.platform === 'Quest'"
                                style="color: var(--platform-quest); margin-left: 10px"
                                >Android</span
                            >
                            <span
                                v-else-if="feed.platform === 'iOS'"
                                style="color: var(--platform-ios); margin-left: 10px"
                                >iOS</span
                            >
                            <span v-if="!feed.inCache" style="color: var(--vr-text-muted); margin-left: 10px"
                                ><Download class="inline-block h-4 w-4" />
                            </span>
                            <span v-text="feed.avatar.name" style="margin-left: 10px"></span>
                        </template>
                        <template v-else-if="feed.type === 'SpawnEmoji'">
                            <span style="margin-left: 10px; color: var(--vr-text-secondary)">SpawnEmoji</span>
                            <span v-text="feed.text" style="margin-left: 10px"></span>
                        </template>
                        <span
                            v-else-if="feed.color === 'yellow'"
                            v-text="feed.text"
                            style="color: yellow; margin-left: 10px"></span>
                        <span
                            v-else
                            style="margin-left: 10px; color: var(--vr-text-secondary)"
                            v-text="feed.text"></span>
                        <template v-if="feed.combo > 1">
                            <span class="combo" style="margin-left: 10px">x{{ feed.combo }}</span>
                        </template>
                    </div>
                </div>
            </div>
            <div class="hud-timeout" v-if="hudTimeout.length > 0">
                <div class="hud-timeout-feed">
                    <div v-for="(feed, index) in hudTimeout" :key="`timeout-${index}-${feed.displayName}-${feed.time}`">
                        <p class="item">({{ feed.time }}s) {{ feed.displayName }}</p>
                    </div>
                </div>
                <svg
                    version="1.1"
                    xmlns="http://www.w3.org/2000/svg"
                    xmlns:xlink="http://www.w3.org/1999/xlink"
                    xml:space="preserve">
                    <path
                        fill="#ED1B24"
                        d="M68.6,96.5L87,78.1c1.6-1.6,1.6-4.1,0-5.7s-4.1-1.6-5.7,0L62.9,90.9L44.5,72.5l18.4-18.4c1.6-1.6,1.6-4.1,0-5.7c-1.6-1.6-4.1-1.6-5.7,0L38.9,66.8l-6.4-6.4L21.2,71.8C11,82,9.7,97.9,17.4,109.5L0,126.9l8.5,8.5L25.9,118c11.6,7.7,27.5,6.4,37.8-3.8L75,102.9C75,102.9,68.6,96.5,68.6,96.5z"></path>
                    <path
                        fill="#ED1B24"
                        d="M102.9,75l11.3-11.3c10.3-10.3,11.5-26.1,3.8-37.8l17.4-17.4L126.9,0l-17.4,17.4C97.9,9.7,82,11,71.8,21.2L60.5,32.5C102,74,60.8,32.9,102.9,75z"></path>
                </svg>
            </div>
        </div>
    </div>
</template>

<script setup>
    import {
        AlertTriangle,
        ArrowRight,
        Ban,
        Check,
        Circle,
        Download,
        Footprints,
        GraduationCap,
        Heart,
        HeartHandshake,
        HeartPlus,
        Info,
        Loader2,
        Megaphone,
        MessageSquare,
        Music,
        Pencil,
        Play,
        Send,
        Tag,
        ThumbsDown,
        TvMinimalPlay,
        VolumeX,
        Volume2,
        X,
        XCircle
    } from 'lucide-vue-next';
    import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, toRefs } from 'vue';
    import { useI18n } from 'vue-i18n';

    import MarqueeText from 'vue-marquee-text-component';
    import Noty from 'noty';

    import { escapeTag, escapeTagRecursive } from '../shared/utils/base/string';
    import { changeHtmlLangAttribute } from '../shared/utils/base/ui';
    import { displayLocation } from '../shared/utils/location';
    import { loadLocalizedStrings } from '../plugins/i18n';
    import { removeFromArray } from '../shared/utils/base/array';
    import { timeToText } from '../shared/utils/base/format';

    import AuroraIcon from '../components/AuroraIcon.vue';
    import AuroraLogo from '../components/AuroraLogo.vue';
    import VrLocation from './components/VrLocation.vue';

    import * as workerTimers from 'worker-timers';

    import './vr.css';

    defineOptions({
        name: 'vr'
    });


    // Aurora in the headset: a tiny synth blip for events, alarms and the quick controls.
    const neonState = reactive({ accent: '#b4b4b4', mm: false, mmMuted: false, mmApp: '', mmVol: 80, song: '', artist: '', playing: false, chatbox: false, sounds: true, afk: false, music: false, preview: '', nextAlarm: '', watchAlert: null });
    // ---- the wrist opening: the overlay host calls wristShown / wristHidden ----
    const wristStage = ref(null);
    const wristPhase = ref('');
    let wristTimer = null;
    function wristHidden() {
        clearTimeout(wristTimer);
        wristPhase.value = 'closed';
    }
    function wristClosing() {
        clearTimeout(wristTimer);
        glitchOn.value = false;
        wristPhase.value = 'closing';
    }
    function wristShown() {
        clearTimeout(wristTimer);
        wristPhase.value = 'closed';
        // restart the animation from the first frame
        void wristStage.value?.offsetWidth;
        requestAnimationFrame(() => {
            wristPhase.value = 'opening';
            wristTimer = setTimeout(() => (wristPhase.value = ''), 2000);
        });
    }

    // ---- glitches: rare on their own, and whenever something happens ----
    const glitchOn = ref(false);
    const glitchBars = ref([]);
    const noiseStyle = ref({});
    let glitchTimer = null;
    let glitchLoop = null;
    let glitchId = 0;
    function wristGlitch(strength = 1) {
        const n = 3 + Math.round(Math.random() * 4 * strength);
        glitchBars.value = Array.from({ length: n }, () => ({
            id: glitchId++,
            top: 40 + Math.random() * 420,
            h: 2 + Math.random() * 16 * strength,
            dx: (Math.random() - 0.5) * 50 * strength
        }));
        glitchOn.value = false;
        void wristStage.value?.offsetWidth;
        requestAnimationFrame(() => {
            glitchOn.value = true;
            clearTimeout(glitchTimer);
            glitchTimer = setTimeout(() => (glitchOn.value = false), 420);
        });
    }
    function scheduleGlitch() {
        clearTimeout(glitchLoop);
        glitchLoop = setTimeout(
            () => {
                if (wristPhase.value === '') {
                    wristGlitch(0.6 + Math.random() * 0.6);
                }
                scheduleGlitch();
            },
            22000 + Math.random() * 26000
        );
    }
    /** a small tile of grey static, made once */
    function makeNoise() {
        try {
            const c = document.createElement('canvas');
            c.width = c.height = 96;
            const g = c.getContext('2d');
            const img = g.createImageData(96, 96);
            for (let i = 0; i < img.data.length; i += 4) {
                const v = Math.random() * 255;
                img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
                img.data[i + 3] = Math.random() < 0.5 ? 255 : 0;
            }
            g.putImageData(img, 0, 0);
            noiseStyle.value = { '--vr-noise': `url(${c.toDataURL()})` };
        } catch {
            // no canvas, no static
        }
    }

    let lastWatchAt = 0;
    function neonStateUpdate(json) {
        Object.assign(neonState, { watchAlert: null }, JSON.parse(json));
        // a soft double tick when someone flagged joins
        if (neonState.watchAlert && neonState.watchAlert.at !== lastWatchAt) {
            lastWatchAt = neonState.watchAlert.at;
            wristGlitch(1.4);
            if (neonState.sounds) {
                blip([
                    [660, 0.08],
                    [520, 0.12]
                ]);
            }
        }
        document.documentElement.style.setProperty('--vr-accent', neonState.accent || '#b4b4b4');
    }
    // quitting needs a second tap within 3 seconds
    const quitArmed = ref(false);
    let quitArmTimer = null;
    function dashPress(cmd) {
        if (cmd === 'quitGame' && !quitArmed.value) {
            quitArmed.value = true;
            clearTimeout(quitArmTimer);
            quitArmTimer = setTimeout(() => (quitArmed.value = false), 3000);
            blip([[600, 0.06]]);
            return;
        }
        if (cmd === 'quitGame') {
            quitArmed.value = false;
            clearTimeout(quitArmTimer);
        }
        try {
            AppApiVr.NeonCommand(cmd);
        } catch (e) {
            console.error(e);
        }
        blip([[900, 0.05]]);
    }
    const onOffWord = (v) => (v ? 'On' : 'Off');
    const dashGroups = computed(() => [
        {
            title: 'Mic',
            buttons: [
                { cmd: 'mmToggle', icon: 'power', label: 'Mic mix', state: onOffWord(neonState.mm), on: neonState.mm },
                { cmd: 'mmMute', icon: neonState.mmMuted ? 'mute' : 'mic', label: 'Mute', state: onOffWord(neonState.mmMuted), on: neonState.mmMuted, warn: neonState.mmMuted },
                { cmd: 'mmSource', icon: 'refresh', label: 'Music from', state: neonState.mmApp ? neonState.mmApp.slice(0, 12) : 'None' },
                { cmd: 'mmDown', icon: 'minus', label: 'Music' },
                { cmd: 'mmUp', icon: 'plus', label: 'Music', state: neonState.mmVol + '%' }
            ]
        },
        {
            title: 'Chatbox',
            buttons: [
                { cmd: 'chatbox', icon: 'chat', label: 'Chatbox', state: onOffWord(neonState.chatbox), on: neonState.chatbox },
                { cmd: 'brb', icon: 'arrow', label: 'Send BRB' },
                { cmd: 'clear', icon: 'close', label: 'Clear' },
                { cmd: 'afk', icon: 'moon', label: 'AFK tag', state: onOffWord(neonState.afk), on: neonState.afk },
                { cmd: 'music', icon: 'music', label: 'Song line', state: onOffWord(neonState.music), on: neonState.music }
            ]
        },
        {
            title: 'Timers',
            buttons: [
                { cmd: 'timer5', icon: 'alarm', label: '5 min' },
                { cmd: 'timer15', icon: 'alarm', label: '15 min' },
                { cmd: 'timer30', icon: 'alarm', label: '30 min' },
                { cmd: 'timer60', icon: 'alarm', label: '1 hour' },
                { cmd: 'stopAlarm', icon: 'close', label: 'Stop alarm', warn: true }
            ]
        },
        {
            title: 'Overlay',
            buttons: [
                { cmd: 'sounds', icon: 'speaker', label: 'Beeps', state: onOffWord(neonState.sounds), on: neonState.sounds },
                { cmd: 'quitGame', icon: 'power', label: quitArmed.value ? 'Tap again' : 'Crash VRChat', state: quitArmed.value ? 'to crash' : undefined, warn: true }
            ]
        }
    ]);
    const musicLine = computed(() =>
        neonState.song ? `${neonState.artist ? neonState.artist + ' - ' : ''}${neonState.song}` : 'nothing playing'
    );
    function neonAlarmStop() {
        alarmBanner.value = null;
        clearTimeout(alarmTimer);
    }
    const alarmBanner = ref(null);
    let alarmTimer = null;
    function neonAlarm(json) {
        const data = JSON.parse(json);
        alarmBanner.value = data;
        wristGlitch(1.2);
        const notes = [];
        for (let i = 0; i < 6; i++) {
            notes.push([880, 0.14], [1175, 0.14]);
        }
        blip(notes);
        clearTimeout(alarmTimer);
        alarmTimer = setTimeout(() => {
            alarmBanner.value = null;
        }, 20000);
    }
    let neonLastKey = '';
    let audioCtx = null;
    function blip(notes) {
        if (neonState.sounds === false) {
            return;
        }
        try {
            audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
            let t = audioCtx.currentTime;
            for (const [freq, len] of notes) {
                const o = audioCtx.createOscillator();
                const g = audioCtx.createGain();
                o.type = 'square';
                o.frequency.value = freq;
                g.gain.setValueAtTime(0.0001, t);
                g.gain.exponentialRampToValueAtTime(0.05, t + 0.01);
                g.gain.exponentialRampToValueAtTime(0.0001, t + len);
                o.connect(g).connect(audioCtx.destination);
                o.start(t);
                o.stop(t + len + 0.02);
                t += len;
            }
        } catch {
            // no audio available, the animation still plays
        }
    }
    const NEON_REACTIONS = {
        OnPlayerJoined: { notes: [[660, 0.07], [880, 0.1]] },
        OnPlayerLeft: { notes: [[520, 0.08], [380, 0.12]] },
        Online: { notes: [[740, 0.06], [988, 0.06], [1240, 0.1]] },
        Offline: { notes: [[420, 0.1], [300, 0.14]] },
        GPS: { notes: [[600, 0.05], [600, 0.05]] }
    };
    function neonReact(type) {
        const r = NEON_REACTIONS[type];
        if (!r) {
            return;
        }
        blip(r.notes);
    }

    const clock = reactive({ day: '', date: '', hm: '', sec: '', ha: 0, ma: 0, sa: 0, layer: '01' });
    let clockTimer = null;
    function tickClock() {
        const now = new Date();
        clock.day = now.toLocaleDateString(undefined, { weekday: 'long' });
        clock.date = now.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
        clock.hm = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        clock.sec = ':' + String(now.getSeconds()).padStart(2, '0');
        // angles for the round clock
        const sec = now.getSeconds();
        const min = now.getMinutes() + sec / 60;
        clock.sa = sec * 6;
        clock.ma = min * 6;
        clock.ha = ((now.getHours() % 12) + min / 60) * 30;
        clock.layer = String((now.getHours() % 12) + 1).padStart(2, '0');
    }
    /** An arc on the round wrist (centre 255,255), angles in degrees clockwise from the top. */
    function arcPath(r, from, to) {
        const end = Math.max(from + 0.01, Math.min(to, from + 359.99));
        const pt = (deg) => {
            const a = (deg * Math.PI) / 180;
            return `${(255 + r * Math.sin(a)).toFixed(2)} ${(255 - r * Math.cos(a)).toFixed(2)}`;
        };
        return `M ${pt(from)} A ${r} ${r} 0 ${end - from > 180 ? 1 : 0} 1 ${pt(end)}`;
    }
    const DEVICE_SHORT = { headset: 'hmd', leftController: 'l', rightController: 'r', controller: 'ctl', tracker: 'trk' };
    // text that runs round the top and the bottom edge of the wrist
    const topLine = computed(() => {
        const bits = [neonState.chatbox ? 'chat on' : 'chat off', `${vrState.onlineFriendCount || 0} online`];
        if (neonState.nextAlarm) {
            bits.push(`timer ${neonState.nextAlarm}`);
        }
        return bits.join(' / ');
    });
    const bottomLine = computed(() => {
        const bits = [];
        if (vrState.lastLocationTimer) {
            bits.push(`here ${vrState.lastLocationTimer}`);
        }
        for (const d of vrState.devices || []) {
            if (DEVICE_SHORT[d[0]] && d[1] === 'connected') {
                bits.push(`${DEVICE_SHORT[d[0]]} ${d[3]}%`);
            }
        }
        return bits.length ? bits.join(' / ') : 'standing by';
    });


    const { t, locale } = useI18n();

    const vrState = reactive({
        appLanguage: 'en',
        currentCulture: 'en-gb',
        currentTime: new Date().toJSON(),
        cpuUsageEnabled: false,
        cpuUsage: '0',
        pcUptimeEnabled: false,
        pcUptime: '',
        customInfo: '',
        config: {},
        onlineFriendCount: 0,
        nowPlaying: {
            url: '',
            name: '',
            length: 0,
            startTime: 0,
            elapsed: 0,
            percentage: 0,
            remainingText: '',
            playing: false
        },
        lastLocation: {
            date: 0,
            location: '',
            name: '',
            playerList: [],
            friendList: [],
            progressPie: false,
            onlineFor: 0
        },
        lastLocationTimer: '',
        onlineForTimer: '',
        wristFeed: [],
        devices: [],
        deviceCount: 0,
        notificationOpacity: 100,
        hudFeed: [],
        hudTimeout: [],
        cleanHudFeedLoopStatus: false,
        isHmdDisabled: false,
        isWristDisabled: false
    });

    let isUnmounted = false;
    let updateStatsLoopTimeoutId = null;
    let updateVrElectronLoopTimeoutId = null;
    let cleanHudFeedLoopTimeoutId = null;

    onMounted(() => {
        tickClock();
        clockTimer = setInterval(tickClock, 1000);
        window.$vr = {};
        window.$vr.configUpdate = configUpdate;
        window.$vr.updateOnlineFriendCount = updateOnlineFriendCount;
        window.$vr.nowPlayingUpdate = nowPlayingUpdate;
        window.$vr.lastLocationUpdate = lastLocationUpdate;
        window.$vr.wristFeedUpdate = wristFeedUpdate;
        window.$vr.neonAlarm = neonAlarm;
        window.$vr.neonState = neonStateUpdate;
        window.$vr.wristShown = wristShown;
        window.$vr.wristHidden = wristHidden;
        window.$vr.wristClosing = wristClosing;
        window.$vr.wristGlitch = wristGlitch;
        makeNoise();
        scheduleGlitch();
        window.$vr.neonAlarmStop = neonAlarmStop;
        window.$vr.refreshCustomScript = refreshCustomScript;
        window.$vr.playNoty = playNoty;
        window.$vr.statusClass = statusClass;
        window.$vr.notyClear = notyClear;
        window.$vr.addEntryHudFeed = addEntryHudFeed;
        window.$vr.updateHudFeedTag = updateHudFeedTag;
        window.$vr.updateHudTimeout = updateHudTimeout;
        window.$vr.setDatetimeFormat = setDatetimeFormat;
        window.$vr.setAppLanguage = setAppLanguage;
        window.$vr.trackingResultToClass = trackingResultToClass;
        window.$vr.updateFeedLength = updateFeedLength;
        window.$vr.updateStatsLoop = updateStatsLoop;
        window.$vr.updateVrElectronLoop = updateVrElectronLoop;
        window.$vr.cleanHudFeedLoop = cleanHudFeedLoop;
        window.$vr.cleanHudFeed = cleanHudFeed;

        window.$vr.vrState = vrState;

        if (LINUX) {
            updateVrElectronLoop();
        }
        refreshCustomScript();
        updateStatsLoop();
        setDatetimeFormat();

        nextTick(() => {
            AppApiVr.VrInit();
        });
    });

    onBeforeUnmount(() => {
        isUnmounted = true;
        clearInterval(clockTimer);
        clearTimeout(glitchLoop);
        clearTimeout(glitchTimer);

        if (updateStatsLoopTimeoutId !== null) {
            workerTimers.clearTimeout(updateStatsLoopTimeoutId);
            updateStatsLoopTimeoutId = null;
        }
        if (updateVrElectronLoopTimeoutId !== null) {
            workerTimers.clearTimeout(updateVrElectronLoopTimeoutId);
            updateVrElectronLoopTimeoutId = null;
        }
        if (cleanHudFeedLoopTimeoutId !== null) {
            workerTimers.clearTimeout(cleanHudFeedLoopTimeoutId);
            cleanHudFeedLoopTimeoutId = null;
        }

        try {
            Noty.closeAll();
        } catch (err) {
            console.error('Error closing Noty notifications:', err);
        }

        if (typeof window.$vr === 'object' && window.$vr) {
            for (const key of Object.keys(window.$vr)) {
                delete window.$vr[key];
            }
        }
        try {
            delete window.$vr;
        } catch {
            window.$vr = undefined;
        }
    });

    /**
     * VR overlay config payload (passed as JSON string).
     *
     * @typedef {object} VrConfigVarsPayload
     * @property {boolean} overlayNotifications
     * @property {boolean} hideDevicesFromFeed
     * @property {boolean} vrOverlayCpuUsage
     * @property {boolean} minimalFeed
     * @property {string} notificationPosition
     * @property {number} notificationTimeout
     * @property {number} photonOverlayMessageTimeout
     * @property {string} notificationTheme
     * @property {boolean} backgroundEnabled
     * @property {boolean} dtHour12
     * @property {boolean} pcUptimeOnFeed
     * @property {string} appLanguage
     * @property {number} notificationOpacity
     * @property {boolean} isWristDisabled
     */

    /**
     * @param {string} json
     * @returns {void}
     */
    function configUpdate(json) {
        vrState.config = JSON.parse(json);
        if (vrState.config.isWristDisabled) {
            vrState.isWristDisabled = true;
        }
        if (!vrState.config.overlayNotifications) {
            vrState.isHmdDisabled = false;
        }
        vrState.hudFeed = [];
        vrState.hudTimeout = [];
        setDatetimeFormat();
        setAppLanguage(vrState.config.appLanguage);
        updateFeedLength();
        if (
            vrState.config.vrOverlayCpuUsage !== vrState.cpuUsageEnabled ||
            vrState.config.pcUptimeOnFeed !== vrState.pcUptimeEnabled
        ) {
            vrState.cpuUsageEnabled = vrState.config.vrOverlayCpuUsage;
            vrState.pcUptimeEnabled = vrState.config.pcUptimeOnFeed;
            AppApiVr.ToggleSystemMonitor(vrState.cpuUsageEnabled || vrState.pcUptimeEnabled);
        }
        if (vrState.config.notificationOpacity !== vrState.notificationOpacity) {
            vrState.notificationOpacity = vrState.config.notificationOpacity;
            setNotyOpacity(vrState.notificationOpacity);
        }
    }

    /**
     * @param count
     */
    function updateOnlineFriendCount(count) {
        vrState.onlineFriendCount = parseInt(count, 10);
    }

    /**
     * @param json
     */
    function nowPlayingUpdate(json) {
        vrState.nowPlaying = JSON.parse(json);
        const circle = /** @type {SVGCircleElement} */ (document.querySelector('.np-progress-circle-stroke'));

        if (vrState.lastLocation.progressPie && vrState.nowPlaying.percentage !== 0) {
            circle.style.opacity = (0.5).toString();
            const circumference = circle.getTotalLength();
            circle.style.strokeDashoffset = (
                circumference -
                (vrState.nowPlaying.percentage / 100) * circumference
            ).toString();
        } else {
            circle.style.opacity = '0';
        }
        updateFeedLength();
    }

    /**
     * @param json
     */
    function lastLocationUpdate(json) {
        vrState.lastLocation = JSON.parse(json);
    }

    /**
     * @param json
     */
    function wristFeedUpdate(json) {
        vrState.wristFeed = JSON.parse(json);
        const top = vrState.wristFeed[0];
        if (top) {
            const key = `${top.type}|${top.created_at}|${top.displayName}`;
            if (neonLastKey && key !== neonLastKey) {
                neonReact(top.type);
            }
            neonLastKey = key;
        }
        updateFeedLength();
    }

    function updateFeedLength() {
        if (vrState.wristFeed.length === 0) {
            return;
        }
        // round wrist: only the 3 most recent events fit under it
        const length = 3;
        if (length < vrState.wristFeed.length) {
            vrState.wristFeed.length = length;
        }
    }

    async function refreshCustomScript() {
        if (document.contains(document.getElementById('vr-custom-script'))) {
            document.getElementById('vr-custom-script').remove();
        }
        const customScript = await AppApiVr.CustomVrScript();
        if (customScript) {
            const head = document.head;
            const $vrCustomScript = document.createElement('script');
            $vrCustomScript.setAttribute('id', 'vr-custom-script');
            $vrCustomScript.type = 'text/javascript';
            $vrCustomScript.textContent = customScript;
            head.appendChild($vrCustomScript);
        }
    }

    /**
     * @param value
     */
    function setNotyOpacity(value) {
        const opacity = (value / 100).toFixed(2);
        let element = document.getElementById('noty-opacity');
        if (!element) {
            document.body.insertAdjacentHTML(
                'beforeend',
                `<style id="noty-opacity">.noty_layout { opacity: ${opacity}; }</style>`
            );
            element = document.getElementById('noty-opacity');
        }
        element.innerHTML = `.noty_layout { opacity: ${opacity}; }`;
    }

    async function updateStatsLoop() {
        try {
            vrState.currentTime = new Date()
                .toLocaleDateString(vrState.currentCulture, {
                    month: '2-digit',
                    day: '2-digit',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: 'numeric',
                    second: 'numeric',
                    hourCycle: vrState.config.dtHour12 ? 'h12' : 'h23'
                })
                .replace(' AM', ' am')
                .replace(' PM', ' pm')
                .replace(',', '');

            if (vrState.cpuUsageEnabled) {
                const cpuUsage = await AppApiVr.CpuUsage();
                vrState.cpuUsage = cpuUsage.toFixed(0);
            }
            if (vrState.lastLocation.date) {
                vrState.lastLocationTimer = timeToText(Date.now() - vrState.lastLocation.date);
            } else {
                vrState.lastLocationTimer = '';
            }
            if (vrState.lastLocation.onlineFor) {
                vrState.onlineForTimer = timeToText(Date.now() - vrState.lastLocation.onlineFor);
            } else {
                vrState.onlineForTimer = '';
            }

            if (!vrState.config.hideDevicesFromFeed) {
                AppApiVr.GetVRDevices().then((devices) => {
                    let deviceList = [];
                    let baseStations = 0;
                    devices.forEach((device) => {
                        device[3] = parseInt(device[3], 10).toString();
                        if (device[0] === 'base' && device[1] === 'connected') {
                            baseStations++;
                        } else {
                            deviceList.push(device);
                        }
                    });
                    vrState.deviceCount = deviceList.length;
                    const deviceValue = (dev) => {
                        if (dev[0] === 'headset') return 0;
                        if (dev[0] === 'leftController') return 1;
                        if (dev[0] === 'rightController') return 2;
                        if (dev[0].toLowerCase().includes('controller')) return 3;
                        if (dev[0] === 'tracker' || dev[0] === 'base') return 4;
                        return 5;
                    };
                    deviceList.sort((a, b) => deviceValue(a) - deviceValue(b));
                    deviceList.sort((a, b) => {
                        if (a[1] === b[1]) {
                            return 0;
                        }
                        if (a[1] === 'connected') {
                            return -1;
                        }
                        if (a[1] === 'disconnected') {
                            return 1;
                        }
                        return 0;
                    });
                    if (baseStations > 0) {
                        deviceList.push(['base', 'connected', '', baseStations]);
                        vrState.deviceCount += 1;
                    }
                    vrState.devices = deviceList;
                });
            } else {
                vrState.devices = [];
            }
            if (vrState.config.pcUptimeOnFeed) {
                AppApiVr.GetUptime().then((uptime) => {
                    if (uptime) {
                        vrState.pcUptime = timeToText(uptime);
                    }
                });
            } else {
                vrState.pcUptime = '';
            }
        } catch (err) {
            console.error(err);
        }
        if (isUnmounted) {
            return;
        }
        updateStatsLoopTimeoutId = workerTimers.setTimeout(() => updateStatsLoop(), 500);
    }

    async function updateVrElectronLoop() {
        try {
            const overlayQueue = await AppApiVr.GetExecuteVrOverlayFunctionQueue();
            if (overlayQueue) {
                overlayQueue.forEach((item) => {
                    // item[0] is the function name, item[1] is already an object
                    const fullFunctionName = item[0];
                    const jsonArg = item[1];

                    if (typeof window.$vr === 'object' && typeof window.$vr[fullFunctionName] === 'function') {
                        window.$vr[fullFunctionName](jsonArg);
                    } else {
                        console.error(`$vr.${fullFunctionName} is not defined or is not a function`);
                    }
                });
            }
        } catch (err) {
            console.error(err);
        }
        if (isUnmounted) {
            return;
        }
        updateVrElectronLoopTimeoutId = workerTimers.setTimeout(() => updateVrElectronLoop(), 500);
    }

    /**
     * @param json
     */
    function playNoty(json) {
        let { noty, message, image } = JSON.parse(json);
        if (typeof noty === 'undefined') {
            console.error('noty is undefined');
            return;
        }
        noty = escapeTagRecursive(noty);
        message = escapeTag(message) || '';
        let text = '';
        let img = '';
        if (image) {
            img = `<img class="noty-img" src="${image}"></img>`;
        }
        switch (noty.type) {
            case 'OnPlayerJoined':
                text = `<strong>${noty.displayName}</strong> has joined`;
                break;
            case 'OnPlayerLeft':
                text = `<strong>${noty.displayName}</strong> has left`;
                break;
            case 'OnPlayerJoining':
                text = `<strong>${noty.displayName}</strong> is joining`;
                break;
            case 'GPS':
                text = `<strong>${noty.displayName}</strong> is in ${displayLocation(
                    noty.location,
                    noty.worldName,
                    noty.groupName
                )}`;
                break;
            case 'Online':
                let locationName = '';
                if (noty.worldName) {
                    locationName = ` to ${displayLocation(noty.location, noty.worldName, noty.groupName)}`;
                }
                text = `<strong>${noty.displayName}</strong> has logged in${locationName}`;
                break;
            case 'Offline':
                text = `<strong>${noty.displayName}</strong> has logged out`;
                break;
            case 'Status':
                text = `<strong>${noty.displayName}</strong> status is now <i>${noty.status}</i> ${noty.statusDescription}`;
                break;
            case 'invite':
                text = `<strong>${noty.senderUsername}</strong> has invited you to ${displayLocation(
                    noty.details.worldId,
                    noty.details.worldName,
                    ''
                )}${message}`;
                break;
            case 'requestInvite':
                text = `<strong>${noty.senderUsername}</strong> has requested an invite ${message}`;
                break;
            case 'inviteResponse':
                text = `<strong>${noty.senderUsername}</strong> has responded to your invite ${message}`;
                break;
            case 'requestInviteResponse':
                text = `<strong>${noty.senderUsername}</strong> has responded to your invite request ${message}`;
                break;
            case 'friendRequest':
                text = `<strong>${noty.senderUsername}</strong> has sent you a friend request`;
                break;
            case 'Friend':
                text = `<strong>${noty.displayName}</strong> is now your friend`;
                break;
            case 'Unfriend':
                text = `<strong>${noty.displayName}</strong> is no longer your friend`;
                break;
            case 'TrustLevel':
                text = `<strong>${noty.displayName}</strong> trust level is now ${noty.trustLevel}`;
                break;
            case 'DisplayName':
                text = `<strong>${noty.previousDisplayName}</strong> changed their name to ${noty.displayName}`;
                break;
            case 'boop':
                text = noty.message;
                break;
            case 'groupChange':
                text = `<strong>${noty.senderUsername}</strong> ${noty.message}`;
                break;
            case 'group.announcement':
                text = noty.message;
                break;
            case 'group.event.created':
                text = noty.message;
                break;
            case 'group.event.starting':
                text = noty.message;
                break;
            case 'group.informative':
                text = noty.message;
                break;
            case 'group.invite':
                text = noty.message;
                break;
            case 'group.joinRequest':
                text = noty.message;
                break;
            case 'group.transfer':
                text = noty.message;
                break;
            case 'group.queueReady':
                text = noty.message;
                break;
            case 'instance.closed':
                text = noty.message;
                break;
            case 'PortalSpawn':
                if (noty.displayName) {
                    text = `<strong>${noty.displayName}</strong> has spawned a portal to ${displayLocation(
                        noty.instanceId,
                        noty.worldName,
                        noty.groupName
                    )}`;
                } else {
                    text = 'User has spawned a portal';
                }
                break;
            case 'AvatarChange':
                text = `<strong>${noty.displayName}</strong> changed into avatar ${noty.name}`;
                break;
            case 'ChatBoxMessage':
                text = `<strong>${noty.displayName}</strong> said ${noty.text}`;
                break;
            case 'Event':
                text = noty.data;
                break;
            case 'External':
                text = noty.message;
                break;
            case 'VideoPlay':
                text = `<strong>Now playing:</strong> ${noty.notyName}`;
                break;
            case 'BlockedOnPlayerJoined':
                text = `Blocked user <strong>${noty.displayName}</strong> has joined`;
                break;
            case 'BlockedOnPlayerLeft':
                text = `Blocked user <strong>${noty.displayName}</strong> has left`;
                break;
            case 'MutedOnPlayerJoined':
                text = `Muted user <strong>${noty.displayName}</strong> has joined`;
                break;
            case 'MutedOnPlayerLeft':
                text = `Muted user <strong>${noty.displayName}</strong> has left`;
                break;
            case 'Blocked':
                text = `<strong>${noty.displayName}</strong> has blocked you`;
                break;
            case 'Unblocked':
                text = `<strong>${noty.displayName}</strong> has unblocked you`;
                break;
            case 'Muted':
                text = `<strong>${noty.displayName}</strong> has muted you`;
                break;
            case 'Unmuted':
                text = `<strong>${noty.displayName}</strong> has unmuted you`;
                break;
            default:
                break;
        }
        if (text) {
            new Noty({
                type: 'alert',
                theme: vrState.config.notificationTheme,
                timeout: vrState.config.notificationTimeout,
                layout: vrState.config.notificationPosition,
                text: `${img}<div class="noty-text">${text}</div>`
            }).show();
        }
    }

    /**
     * @param status
     */
    function statusClass(status) {
        let style = {};
        if (typeof status === 'undefined') {
            return style;
        }
        if (status === 'active') {
            // Online
            style.online = true;
        } else if (status === 'join me') {
            // Join Me
            style.joinme = true;
        } else if (status === 'ask me') {
            // Ask Me
            style.askme = true;
        } else if (status === 'busy') {
            // Do Not Disturb
            style.busy = true;
        }
        return style;
    }

    function notyClear() {
        Noty.closeAll();
    }

    function cleanHudFeedLoop() {
        if (!vrState.cleanHudFeedLoopStatus) {
            return;
        }
        cleanHudFeed();
        if (vrState.hudFeed.length === 0) {
            vrState.cleanHudFeedLoopStatus = false;
            return;
        }
        if (isUnmounted) {
            return;
        }
        cleanHudFeedLoopTimeoutId = workerTimers.setTimeout(() => cleanHudFeedLoop(), 500);
    }

    function cleanHudFeed() {
        const dt = Date.now();
        vrState.hudFeed.forEach((item) => {
            if (item.time + vrState.config.photonOverlayMessageTimeout < dt) {
                removeFromArray(vrState.hudFeed, item);
            }
        });
        if (vrState.hudFeed.length > 10) {
            vrState.hudFeed.length = 10;
        }
        if (!vrState.cleanHudFeedLoopStatus) {
            vrState.cleanHudFeedLoopStatus = true;
            cleanHudFeedLoop();
        }
    }

    /**
     * @param json
     */
    function addEntryHudFeed(json) {
        const data = JSON.parse(json);
        let combo = 1;
        vrState.hudFeed.forEach((item) => {
            if (item.displayName === data.displayName && item.text === data.text) {
                combo = item.combo + 1;
                removeFromArray(vrState.hudFeed, item);
            }
        });
        vrState.hudFeed.unshift({
            time: Date.now(),
            combo,
            ...data
        });
        cleanHudFeed();
    }

    /**
     * @param json
     */
    function updateHudFeedTag(json) {
        const ref = JSON.parse(json);
        vrState.hudFeed.forEach((item) => {
            if (item.userId === ref.userId) {
                item.colour = ref.colour;
            }
        });
    }

    /**
     * @param json
     */
    function updateHudTimeout(json) {
        vrState.hudTimeout = JSON.parse(json);
    }

    async function setDatetimeFormat() {
        vrState.currentCulture = await AppApiVr.CurrentCulture();
    }

    const formatDate = (date) => {
        if (!date) {
            return '';
        }
        const dt = new Date(date);
        return dt
            .toLocaleTimeString(vrState.currentCulture, {
                hour: '2-digit',
                minute: 'numeric',
                hourCycle: vrState.config.dtHour12 ? 'h12' : 'h23'
            })
            .replace(' am', '')
            .replace(' pm', '');
    };

    /**
     * @param appLanguage
     */
    async function setAppLanguage(appLanguage) {
        if (!appLanguage) {
            return;
        }
        vrState.appLanguage = appLanguage;

        await loadLocalizedStrings(appLanguage);
        changeHtmlLangAttribute(vrState.appLanguage);
        locale.value = vrState.appLanguage;
    }

    /**
     * @param deviceStatus
     */
    function trackingResultToClass(deviceStatus) {
        switch (deviceStatus) {
            case 'Uninitialized':
            case 'Calibrating_OutOfRange':
            case 'Fallback_RotationOnly':
                return 'tracker-error';

            case 'Calibrating_InProgress':
            case 'Running_OutOfRange':
                return 'tracker-warning';

            case 'Running_OK':
            default:
                return '';
        }
    }

    const {
        config,
        wristFeed,
        devices,
        nowPlaying,
        lastLocation,
        lastLocationTimer,
        onlineForTimer,
        pcUptime,
        currentTime,
        cpuUsageEnabled,
        cpuUsage,
        onlineFriendCount,
        customInfo,
        hudFeed,
        hudTimeout
    } = toRefs(vrState);
</script>
