from getmac import get_mac_address

def get_mac_addresses():
    """Get MAC addresses using getmac library"""
    # Get default interface MAC
    default_mac = get_mac_address()
    
    # Get MAC by interface name
    ethernet_mac = get_mac_address(interface="Ethernet")
    wifi_mac = get_mac_address(interface="Wi-Fi")
    
    # Get MAC by IP
    ip_mac = get_mac_address(ip="192.168.1.1")
    hostname_mac = get_mac_address(hostname="localhost")
    
    return {
        "default": default_mac,
        "ethernet": ethernet_mac,
        "wifi": wifi_mac,
        "ip_based": ip_mac,
        "hostname_based": hostname_mac
    }

# Usage
mac_addresses = get_mac_addresses()
for interface, mac in mac_addresses.items():
    print(f"{interface}: {mac}")