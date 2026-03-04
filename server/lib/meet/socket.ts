import type { Server, Socket } from "socket.io";
import { hashMeetJti, verifyMeetInviteToken } from "./inviteToken";
import { getMeetInviteSecret } from "./inviteToken";
import {
  markParticipantLeft,
  recordMeetEvent,
  resolveInviteToken,
  resolveMeetAccessFromInviteToken,
  setParticipantKick,
  setParticipantMute,
} from "./service";

type MeetPeerState = {
  meetingId: string;
  tenantId: number;
  participantId: number;
  role: "host" | "cohost" | "attendee" | "observer";
  displayName: string;
  token: string;
};

type SfuTransport = any;
type SfuProducer = any;
type SfuConsumer = any;

const peerBySocket = new Map<string, MeetPeerState>();
const meetingMembers = new Map<string, Set<string>>();
const socketTransports = new Map<string, Map<string, SfuTransport>>();
const socketProducers = new Map<string, Map<string, SfuProducer>>();
const socketConsumers = new Map<string, Map<string, SfuConsumer>>();

const mediasoupState = {
  initialized: false,
  failed: false,
  module: null as any,
  worker: null as any,
  routers: new Map<string, any>(),
  producerToSocket: new Map<string, string>(),
};

function getRoomName(meetingId: string) {
  return `meet:${meetingId}`;
}

function getOrCreateSet(map: Map<string, Set<string>>, key: string) {
  const current = map.get(key);
  if (current) return current;
  const next = new Set<string>();
  map.set(key, next);
  return next;
}

function isHostLike(role: string) {
  return role === "host" || role === "cohost";
}

async function maybeInitMediasoup() {
  if (mediasoupState.initialized || mediasoupState.failed) return mediasoupState.module;
  mediasoupState.initialized = true;
  try {
    const imported = await (0, eval)("import('mediasoup')");
    const module = imported?.default ? imported.default : imported;
    const worker = await module.createWorker({
      rtcMinPort: Number(process.env.MEET_RTC_MIN_PORT || 40000),
      rtcMaxPort: Number(process.env.MEET_RTC_MAX_PORT || 49999),
      logLevel: process.env.MEET_MEDIASOUP_LOG_LEVEL || "warn",
      logTags: ["ice", "dtls", "rtp", "srtp", "rtcp"],
    });
    worker.on("died", () => {
      mediasoupState.worker = null;
      mediasoupState.failed = true;
      console.error("[meet-sfu] mediasoup worker died");
    });
    mediasoupState.module = module;
    mediasoupState.worker = worker;
    console.log("[meet-sfu] mediasoup initialized");
    return module;
  } catch (error: any) {
    mediasoupState.failed = true;
    console.warn(`[meet-sfu] mediasoup unavailable: ${error?.message || "import failed"}`);
    return null;
  }
}

async function getOrCreateRouter(meetingId: string) {
  if (mediasoupState.routers.has(meetingId)) return mediasoupState.routers.get(meetingId);
  const module = await maybeInitMediasoup();
  if (!module || !mediasoupState.worker) return null;
  const router = await mediasoupState.worker.createRouter({
    mediaCodecs: [
      { kind: "audio", mimeType: "audio/opus", clockRate: 48000, channels: 2 },
      {
        kind: "video",
        mimeType: "video/VP8",
        clockRate: 90000,
        parameters: {
          "x-google-start-bitrate": 1000,
        },
      },
    ],
  });
  mediasoupState.routers.set(meetingId, router);
  return router;
}

function getAnnouncedIp() {
  return String(process.env.MEET_ANNOUNCED_IP || process.env.PUBLIC_IP || process.env.APP_PUBLIC_IP || "").trim() || undefined;
}

function getTransportMap(socketId: string) {
  const existing = socketTransports.get(socketId);
  if (existing) return existing;
  const next = new Map<string, SfuTransport>();
  socketTransports.set(socketId, next);
  return next;
}

function getProducerMap(socketId: string) {
  const existing = socketProducers.get(socketId);
  if (existing) return existing;
  const next = new Map<string, SfuProducer>();
  socketProducers.set(socketId, next);
  return next;
}

function getConsumerMap(socketId: string) {
  const existing = socketConsumers.get(socketId);
  if (existing) return existing;
  const next = new Map<string, SfuConsumer>();
  socketConsumers.set(socketId, next);
  return next;
}

async function closeSocketResources(socketId: string) {
  const consumers = socketConsumers.get(socketId);
  if (consumers) {
    for (const consumer of consumers.values()) {
      try {
        consumer.close();
      } catch {
        // noop
      }
    }
  }
  const producers = socketProducers.get(socketId);
  if (producers) {
    for (const producer of producers.values()) {
      try {
        mediasoupState.producerToSocket.delete(String(producer.id));
        producer.close();
      } catch {
        // noop
      }
    }
  }
  const transports = socketTransports.get(socketId);
  if (transports) {
    for (const transport of transports.values()) {
      try {
        transport.close();
      } catch {
        // noop
      }
    }
  }
  socketConsumers.delete(socketId);
  socketProducers.delete(socketId);
  socketTransports.delete(socketId);
}

export function attachMeetSocketServer(io: Server) {
  const namespace = io.of("/meet");

  namespace.on("connection", (socket: Socket) => {
    socket.on("join", async (payload: any, callback?: (result: any) => void) => {
      try {
        const token = String(socket.handshake.auth?.token || socket.handshake.query?.token || payload?.token || "").trim();
        const meetingId = String(payload?.meetingId || "").trim();
        if (!token) throw new Error("missing_token");
        if (!meetingId) throw new Error("missing_meeting_id");

        const secret = getMeetInviteSecret();
        if (!secret) throw new Error("missing_meet_secret");
        const verified = verifyMeetInviteToken(token, secret);
        if (!verified.ok || !verified.payload) throw new Error(verified.reason || "invalid_token");

        const inviteState = await resolveInviteToken({
          token,
          tenantId: verified.payload.tenantId,
          meetingId,
        });
        if (!inviteState.ok || !inviteState.payload) throw new Error(inviteState.reason || "invite_invalid");

        const access = await resolveMeetAccessFromInviteToken({
          token,
          tenantId: verified.payload.tenantId,
          meetingId,
        });
        if (!access.ok) throw new Error(access.reason || "access_denied");
        if (!access.participant) throw new Error("access_denied");

        const role = access.role;
        const displayName = String(payload?.displayName || access.participant.displayName || "Participant").trim();
        const room = getRoomName(meetingId);
        await socket.join(room);

        peerBySocket.set(socket.id, {
          meetingId,
          tenantId: verified.payload.tenantId,
          participantId: Number(access.participant.id),
          role,
          displayName,
          token,
        });
        getOrCreateSet(meetingMembers, meetingId).add(socket.id);

        await recordMeetEvent({
          tenantId: verified.payload.tenantId,
          meetingId,
          participantId: Number(access.participant.id),
          eventType: "participant_joined",
          payload: {
            displayName,
            role,
          },
        });

        namespace.to(room).emit("participant_joined", {
          socketId: socket.id,
          participantId: Number(access.participant.id),
          displayName,
          role,
        });

        callback?.({
          ok: true,
          meetingId,
          participantId: Number(access.participant.id),
          role,
          displayName,
          hostControls: isHostLike(role),
          mediasoupEnabled: !mediasoupState.failed,
        });
      } catch (error: any) {
        callback?.({ ok: false, error: error?.message || "join_failed" });
      }
    });

    socket.on("createWebRtcTransport", async (_payload: any, callback?: (result: any) => void) => {
      const peer = peerBySocket.get(socket.id);
      if (!peer) return callback?.({ ok: false, error: "not_joined" });
      try {
        const router = await getOrCreateRouter(peer.meetingId);
        if (!router) return callback?.({ ok: false, error: "mediasoup_unavailable" });
        const transport = await router.createWebRtcTransport({
          listenIps: [{ ip: "0.0.0.0", announcedIp: getAnnouncedIp() }],
          enableUdp: true,
          enableTcp: true,
          preferUdp: true,
          appData: {
            socketId: socket.id,
            meetingId: peer.meetingId,
            participantId: peer.participantId,
          },
        });
        const transportId = String(transport.id);
        getTransportMap(socket.id).set(transportId, transport);
        transport.on("dtlsstatechange", (state: string) => {
          if (state === "closed") {
            try {
              transport.close();
            } catch {
              // noop
            }
          }
        });
        callback?.({
          ok: true,
          transportOptions: {
            id: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters,
          },
        });
      } catch (error: any) {
        callback?.({ ok: false, error: error?.message || "create_transport_failed" });
      }
    });

    socket.on("connectTransport", async (payload: any, callback?: (result: any) => void) => {
      const peer = peerBySocket.get(socket.id);
      if (!peer) return callback?.({ ok: false, error: "not_joined" });
      try {
        const transportId = String(payload?.transportId || "").trim();
        const dtlsParameters = payload?.dtlsParameters;
        const transport = getTransportMap(socket.id).get(transportId);
        if (!transport) return callback?.({ ok: false, error: "transport_not_found" });
        await transport.connect({ dtlsParameters });
        callback?.({ ok: true });
      } catch (error: any) {
        callback?.({ ok: false, error: error?.message || "connect_transport_failed" });
      }
    });

    socket.on("produce", async (payload: any, callback?: (result: any) => void) => {
      const peer = peerBySocket.get(socket.id);
      if (!peer) return callback?.({ ok: false, error: "not_joined" });
      try {
        const transportId = String(payload?.transportId || "").trim();
        const transport = getTransportMap(socket.id).get(transportId);
        if (!transport) return callback?.({ ok: false, error: "transport_not_found" });
        const producer = await transport.produce({
          kind: payload?.kind,
          rtpParameters: payload?.rtpParameters,
          appData: {
            socketId: socket.id,
            meetingId: peer.meetingId,
            participantId: peer.participantId,
            mediaTag: payload?.appData?.mediaTag || null,
          },
        });
        const producerId = String(producer.id);
        getProducerMap(socket.id).set(producerId, producer);
        mediasoupState.producerToSocket.set(producerId, socket.id);

        producer.on("transportclose", () => {
          getProducerMap(socket.id).delete(producerId);
          mediasoupState.producerToSocket.delete(producerId);
        });

        namespace.to(getRoomName(peer.meetingId)).emit("newProducer", {
          socketId: socket.id,
          participantId: peer.participantId,
          producerId,
          kind: payload?.kind,
        });
        callback?.({ ok: true, producerId });
      } catch (error: any) {
        callback?.({ ok: false, error: error?.message || "produce_failed" });
      }
    });

    socket.on("consume", async (payload: any, callback?: (result: any) => void) => {
      const peer = peerBySocket.get(socket.id);
      if (!peer) return callback?.({ ok: false, error: "not_joined" });
      try {
        const transportId = String(payload?.transportId || "").trim();
        const producerId = String(payload?.producerId || "").trim();
        const transport = getTransportMap(socket.id).get(transportId);
        if (!transport) return callback?.({ ok: false, error: "transport_not_found" });
        if (!producerId) return callback?.({ ok: false, error: "producer_id_required" });
        const router = await getOrCreateRouter(peer.meetingId);
        if (!router) return callback?.({ ok: false, error: "mediasoup_unavailable" });

        if (!router.canConsume({ producerId, rtpCapabilities: payload?.rtpCapabilities })) {
          return callback?.({ ok: false, error: "cannot_consume" });
        }

        const consumer = await transport.consume({
          producerId,
          rtpCapabilities: payload?.rtpCapabilities,
          paused: true,
          appData: {
            socketId: socket.id,
            meetingId: peer.meetingId,
            producerId,
          },
        });
        const consumerId = String(consumer.id);
        getConsumerMap(socket.id).set(consumerId, consumer);
        consumer.on("transportclose", () => {
          getConsumerMap(socket.id).delete(consumerId);
        });
        callback?.({
          ok: true,
          consumerOptions: {
            id: consumer.id,
            producerId,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
            type: consumer.type,
            producerPaused: consumer.producerPaused,
          },
        });
      } catch (error: any) {
        callback?.({ ok: false, error: error?.message || "consume_failed" });
      }
    });

    socket.on("resume", async (payload: any, callback?: (result: any) => void) => {
      try {
        const consumerId = String(payload?.consumerId || "").trim();
        const consumer = getConsumerMap(socket.id).get(consumerId);
        if (!consumer) return callback?.({ ok: false, error: "consumer_not_found" });
        await consumer.resume();
        callback?.({ ok: true });
      } catch (error: any) {
        callback?.({ ok: false, error: error?.message || "resume_failed" });
      }
    });

    socket.on("chat_message", async (payload: any, callback?: (result: any) => void) => {
      const peer = peerBySocket.get(socket.id);
      if (!peer) return callback?.({ ok: false, error: "not_joined" });
      const text = String(payload?.text || "").trim();
      if (!text) return callback?.({ ok: false, error: "text_required" });
      await recordMeetEvent({
        tenantId: peer.tenantId,
        meetingId: peer.meetingId,
        participantId: peer.participantId,
        eventType: "chat_message",
        payload: {
          text,
          displayName: peer.displayName,
          role: peer.role,
        },
      });
      namespace.to(getRoomName(peer.meetingId)).emit("chat_message", {
        participantId: peer.participantId,
        displayName: peer.displayName,
        role: peer.role,
        text,
        at: new Date().toISOString(),
      });
      callback?.({ ok: true });
    });

    socket.on("muteParticipant", async (payload: any, callback?: (result: any) => void) => {
      const peer = peerBySocket.get(socket.id);
      if (!peer) return callback?.({ ok: false, error: "not_joined" });
      if (!isHostLike(peer.role)) return callback?.({ ok: false, error: "forbidden" });
      const participantId = Number(payload?.participantId);
      const isMuted = Boolean(payload?.isMuted ?? true);
      if (!Number.isFinite(participantId)) return callback?.({ ok: false, error: "participant_id_required" });
      const updated = await setParticipantMute({
        tenantId: peer.tenantId,
        meetingId: peer.meetingId,
        participantId: Number(participantId),
        isMuted,
      });
      if (!updated) return callback?.({ ok: false, error: "participant_not_found" });
      await recordMeetEvent({
        tenantId: peer.tenantId,
        meetingId: peer.meetingId,
        participantId: Number(participantId),
        eventType: "participant_muted",
        payload: {
          actorParticipantId: peer.participantId,
          isMuted,
        },
      });
      namespace.to(getRoomName(peer.meetingId)).emit("participant_muted", {
        participantId: Number(participantId),
        isMuted,
      });
      callback?.({ ok: true });
    });

    socket.on("kickParticipant", async (payload: any, callback?: (result: any) => void) => {
      const peer = peerBySocket.get(socket.id);
      if (!peer) return callback?.({ ok: false, error: "not_joined" });
      if (!isHostLike(peer.role)) return callback?.({ ok: false, error: "forbidden" });
      const participantId = Number(payload?.participantId);
      if (!Number.isFinite(participantId)) return callback?.({ ok: false, error: "participant_id_required" });
      const updated = await setParticipantKick({
        tenantId: peer.tenantId,
        meetingId: peer.meetingId,
        participantId: Number(participantId),
        kicked: true,
      });
      if (!updated) return callback?.({ ok: false, error: "participant_not_found" });
      await recordMeetEvent({
        tenantId: peer.tenantId,
        meetingId: peer.meetingId,
        participantId: Number(participantId),
        eventType: "participant_kicked",
        payload: {
          actorParticipantId: peer.participantId,
        },
      });
      namespace.to(getRoomName(peer.meetingId)).emit("participant_kicked", {
        participantId: Number(participantId),
      });
      callback?.({ ok: true });
    });

    socket.on("leave", async (callback?: (result: any) => void) => {
      const peer = peerBySocket.get(socket.id);
      if (peer) {
        await markParticipantLeft({
          tenantId: peer.tenantId,
          meetingId: peer.meetingId,
          participantId: peer.participantId,
        });
        await recordMeetEvent({
          tenantId: peer.tenantId,
          meetingId: peer.meetingId,
          participantId: peer.participantId,
          eventType: "participant_left",
          payload: {},
        });
        namespace.to(getRoomName(peer.meetingId)).emit("participant_left", {
          participantId: peer.participantId,
        });
      }
      await closeSocketResources(socket.id);
      peerBySocket.delete(socket.id);
      callback?.({ ok: true });
    });

    socket.on("disconnect", async () => {
      const peer = peerBySocket.get(socket.id);
      if (peer) {
        try {
          await markParticipantLeft({
            tenantId: peer.tenantId,
            meetingId: peer.meetingId,
            participantId: peer.participantId,
          });
          await recordMeetEvent({
            tenantId: peer.tenantId,
            meetingId: peer.meetingId,
            participantId: peer.participantId,
            eventType: "participant_left",
            payload: {
              reason: "socket_disconnect",
            },
          });
          namespace.to(getRoomName(peer.meetingId)).emit("participant_left", {
            participantId: peer.participantId,
            reason: "socket_disconnect",
          });
        } catch {
          // noop
        }
      }
      await closeSocketResources(socket.id);
      peerBySocket.delete(socket.id);
    });
  });
}
