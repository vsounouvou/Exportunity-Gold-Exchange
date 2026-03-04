FROM codercom/code-server:latest

USER root

RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      xfce4 xfce4-terminal x11vnc xvfb novnc websockify dbus-x11 git curl ca-certificates && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

COPY start.sh /usr/local/bin/workstation-start.sh
RUN chmod +x /usr/local/bin/workstation-start.sh

EXPOSE 3000 3001 6080

USER coder
ENTRYPOINT ["/usr/local/bin/workstation-start.sh"]
