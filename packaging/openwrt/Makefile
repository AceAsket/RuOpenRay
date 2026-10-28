include $(TOPDIR)/rules.mk

PKG_NAME:=ruopenray-ui
PKG_VERSION:=0.5.1_rc4
APP_VERSION:=0.5.1-rc4
PKG_RELEASE:=9

PKG_SOURCE_PROTO:=git
PKG_SOURCE_URL:=https://github.com/AceAsket/RuOpenRay.git
PKG_SOURCE_VERSION:=223dac993fa99c6642d9fc495cfaa71da3e6ba3e
# OpenWrt otherwise reuses name-version.tar.zst when only the Git ref changes.
PKG_SOURCE_SUBDIR:=$(PKG_NAME)-$(PKG_VERSION)-$(PKG_SOURCE_VERSION)
PKG_SOURCE:=$(PKG_SOURCE_SUBDIR).tar.zst
PKG_BUILD_DIR:=$(BUILD_DIR)/$(PKG_SOURCE_SUBDIR)
PKG_MIRROR_HASH:=skip

PKG_BUILD_DEPENDS:=golang/host
PKG_BUILD_PARALLEL:=1
PKG_USE_MIPS16:=0
GO_PKG:=github.com/AceAsket/RuOpenRay
GO_PKG_BUILD_PKG:=$(GO_PKG)/cmd/ruopenray-ui
GO_PKG_LDFLAGS_X:=main.appVersion=$(APP_VERSION)
# The web UI is embedded by Go; the default Go-package file filter drops JS/CSS/HTML.
GO_PKG_INSTALL_ALL:=1

include $(INCLUDE_DIR)/package.mk
include $(TOPDIR)/feeds/packages/lang/golang/golang-package.mk

define Package/ruopenray-ui
  SECTION:=net
  CATEGORY:=Network
  SUBMENU:=Web Servers/Proxies
  TITLE:=RuOpenRay UI for Xray
  URL:=https://github.com/AceAsket/RuOpenRay
  DEPENDS:=$(GO_ARCH_DEPENDS) +ca-bundle +uci +ip-full +nftables-json +kmod-nf-tproxy +kmod-nft-tproxy +kmod-nft-socket
endef

define Package/ruopenray-ui/description
  Standalone Russian web UI for managing Xray profiles on OpenWrt.
endef

define Package/ruopenray-ui/conffiles
/etc/config/ruopenray-ui
endef

define Package/ruopenray-ui/install
	$(call GoPackage/Package/Install/Bin,$(1))
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/etc/init.d/ruopenray-ui $(1)/etc/init.d/ruopenray-ui
	$(INSTALL_DIR) $(1)/usr/share/ruopenray-ui
	$(INSTALL_DATA) ./files/etc/init.d/ruopenray-adguard $(1)/usr/share/ruopenray-ui/ruopenray-adguard.init
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./files/etc/config/ruopenray-ui $(1)/etc/config/ruopenray-ui
	$(INSTALL_DIR) $(1)/etc/ruopenray-ui/profiles
	$(INSTALL_DIR) $(1)/usr/libexec
	$(INSTALL_BIN) ./files/usr/libexec/ruopenray-firstboot $(1)/usr/libexec/ruopenray-firstboot
	$(INSTALL_DIR) $(1)/usr/share/luci/menu.d
	$(INSTALL_DATA) ./files/usr/share/luci/menu.d/luci-app-ruopenray.json $(1)/usr/share/luci/menu.d/luci-app-ruopenray.json
	$(INSTALL_DIR) $(1)/usr/share/rpcd/acl.d
	$(INSTALL_DATA) ./files/usr/share/rpcd/acl.d/luci-app-ruopenray.json $(1)/usr/share/rpcd/acl.d/luci-app-ruopenray.json
	$(INSTALL_DIR) $(1)/usr/share/ucode/luci/template/ruopenray
	$(INSTALL_DATA) ./files/usr/share/ucode/luci/template/ruopenray/dashboard.ut $(1)/usr/share/ucode/luci/template/ruopenray/dashboard.ut
	$(INSTALL_DIR) $(1)/www/luci-static/resources/view/ruopenray
	$(INSTALL_DATA) ./files/www/luci-static/resources/view/ruopenray/dashboard.js $(1)/www/luci-static/resources/view/ruopenray/dashboard.js
endef

define Package/ruopenray-ui/postinst
#!/bin/sh
[ -n "$$IPKG_INSTROOT" ] && exit 0
mkdir -p /etc/ruopenray-ui/profiles /etc/ruopenray-ui/backups
/usr/libexec/ruopenray-firstboot || exit 1
/usr/bin/ruopenray-ui --self-check >/dev/null || exit 1
[ -x /etc/init.d/ruopenray-ui ] && /etc/init.d/ruopenray-ui enable >/dev/null 2>&1 || true
/etc/init.d/ruopenray-ui restart || exit 1
[ -x /etc/init.d/rpcd ] && /etc/init.d/rpcd reload >/dev/null 2>&1 || true
exit 0
endef

define Package/ruopenray-ui/prerm
#!/bin/sh
[ -n "$$IPKG_INSTROOT" ] && exit 0
[ "$$PKG_UPGRADE" = "1" ] && exit 0
/usr/bin/ruopenray-ui --firewall-disable >/tmp/ruopenray-package-remove.log 2>&1 || exit 1
[ -x /etc/init.d/ruopenray-ui ] && /etc/init.d/ruopenray-ui stop >/dev/null 2>&1 || true
[ -x /etc/init.d/ruopenray-ui ] && /etc/init.d/ruopenray-ui disable >/dev/null 2>&1 || true
exit 0
endef

$(eval $(call GoBinPackage,ruopenray-ui))
$(eval $(call BuildPackage,ruopenray-ui))
