from typing import List

# Define Roles
ROLES = {
    "local_employee": 1,
    "local_boss": 2,
    "region_employee": 3,
    "region_boss": 4,
    "factory_employee": 5,
    "factory_admin": 6
}

# Role Hierarchies and allowed message targets based on Role and Region
def can_send_message(sender_role: str, sender_region_id: int, recipient_role: str, recipient_region_id: int) -> bool:
    """
    Evaluates if the sender has the permission to send a message to the recipient based on business logic.
    """
    
    # Factory Admin can write to ANYONE (God Mode)
    if sender_role == "factory_admin":
        return True
        
    # Factory Employee
    if sender_role == "factory_employee":
        # Can write to other factory employees, factory admin, and region bosses
        if recipient_role in ["factory_employee", "factory_admin", "region_boss"]:
            return True
        return False
        
    # Region Boss
    if sender_role == "region_boss":
        # Can write to own region employees, own local bosses, other region bosses, and factory
        if recipient_role in ["factory_admin", "factory_employee", "region_boss"]:
            return True
        if sender_region_id == recipient_region_id and recipient_role in ["region_employee", "local_boss"]:
            return True
        return False
        
    # Region Employee
    if sender_role == "region_employee":
        # Can write to own region employees, own region boss, own local bosses, and factory
        if recipient_role in ["factory_admin", "factory_employee"]:
            return True
        if sender_region_id == recipient_region_id:
            if recipient_role in ["region_employee", "region_boss", "local_boss"]:
                return True
        return False
        
    # Local Boss
    if sender_role == "local_boss":
        # Can write to own local employees, other local bosses in SAME region, and own region boss
        if sender_region_id == recipient_region_id:
            if recipient_role in ["local_employee", "local_boss", "region_boss"]:
                return True
        return False
        
    # Local Employee
    if sender_role == "local_employee":
        # Can write to own local employees and own local boss
        # Assuming local_employee shares the same region_id logic, or has a specific branch_id. 
        # For simplicity, using region_id here.
        if sender_region_id == recipient_region_id:
            if recipient_role in ["local_employee", "local_boss"]:
                return True
        return False

    return False
