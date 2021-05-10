pragma solidity ^0.4.26;
pragma experimental ABIEncoderV2;

contract JsonBuilder {
    uint256 timestamp;
    string text;
    address sender;

    function JsonBuilder(string _text) {
        sender = tx.origin;
        timestamp = block.timestamp;
        text = _text;
    }

    function getall()
        returns (
            string,
            uint256,
            address
        )
    {
        return (text, timestamp, sender);
    }

    function get_text() returns (string) {
        return text;
    }

    function get_timestamp() returns (uint256) {
        return timestamp;
    }

    function get_sender() returns (address) {
        return sender;
    }
}

contract App {
    address[] JsonBuilder_list;
    uint256 JsonBuilder_list_length;

    function get_JsonBuilder_list_length() returns (uint256) {
        return JsonBuilder_list_length;
    }

    function get_JsonBuilder_N(uint256 index)
        returns (
            string,
            uint256,
            address
        )
    {
        return JsonBuilder(JsonBuilder_list[index]).getall();
    }

    function get_last_JsonBuilder_N(uint256 count, uint256 offset)
        returns (
            string[],
            uint256[],
            address[]
        )
    {
        string[] memory text = new string[](count);
        uint256[] memory timestamp = new uint256[](count);
        address[] memory sender = new address[](count);
        for (uint256 i = offset; i < count; i++) {
            JsonBuilder myJsonBuilder =
                JsonBuilder(JsonBuilder_list[i + offset]);
            text[i + offset] = myJsonBuilder.get_text();
            timestamp[i + offset] = myJsonBuilder.get_timestamp();
            sender[i + offset] = myJsonBuilder.get_sender();
        }
        return (text, timestamp, sender);
    }

    struct UserInfo {
        address owner;
        bool exists;
        address[] JsonBuilder_list;
        uint256 JsonBuilder_list_length;
    }
    mapping(address => UserInfo) public user_map;
    address[] UserInfoList;
    uint256 UserInfoListLength;

    event NewJsonBuilder(address sender);

    function new_JsonBuilder(string text) returns (address) {
        address mynew = address(new JsonBuilder({_text: text}));
        if (!user_map[tx.origin].exists) {
            user_map[tx.origin] = create_user_on_new_JsonBuilder(mynew);
        }
        user_map[tx.origin].JsonBuilder_list.push(mynew);

        JsonBuilder_list.push(mynew);
        JsonBuilder_list_length += 1;

        emit NewJsonBuilder(tx.origin);

        return mynew;
    }

    function create_user_on_new_JsonBuilder(address addr)
        private
        returns (UserInfo)
    {
        address[] storage JsonBuilder_list;
        UserInfoList.push(addr);
        return
            UserInfo({
                exists: true,
                owner: addr,
                JsonBuilder_list: JsonBuilder_list,
                JsonBuilder_list_length: 0
            });
    }
}
