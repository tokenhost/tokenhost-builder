// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

contract Txt_contract {
    uint256 public timestamp;
    address public sender;
    string public message;
    uint256 public stake;
    address public Hashtag;

    constructor(string memory _message, address _Hashtag) {
        sender = tx.origin;
        timestamp = block.timestamp;
        message = _message;
        Hashtag = _Hashtag;
    }

    struct TxtData {
        address self;
        uint256 timestamp;
        address sender;
        string message;
        address Hashtag;
    }

    function getAll() external view returns (TxtData memory) {
        return
            TxtData({
                self: address(this),
                timestamp: timestamp,
                sender: sender,
                message: message,
                Hashtag: Hashtag
            });
    }
}

contract Hashtag_contract {
    uint256 public timestamp;
    address public sender;
    string public tag;

    constructor(string memory _tag) {
        sender = tx.origin;
        timestamp = block.timestamp;
        tag = _tag;
    }

    struct HashtagData {
        address self;
        uint256 timestamp;
        address sender;
        string tag;
    }

    function getAll() external view returns (HashtagData memory) {
        return
            HashtagData({
                self: address(this),
                timestamp: timestamp,
                sender: sender,
                tag: tag
            });
    }
}

contract App {
    address[] public Txt_list;

    function get_Txt_N(uint256 index)
        public
        view
        returns (Txt_contract.TxtData memory)
    {
        return Txt_contract(Txt_list[index]).getAll();
    }

    function get_first_Txt_N(uint256 count, uint256 offset)
        public
        view
        returns (Txt_contract.TxtData[] memory)
    {
        require(
            offset + count <= Txt_list.length,
            "Offset + count out of bounds"
        );
        Txt_contract.TxtData[] memory results =
            new Txt_contract.TxtData[](count);
        for (uint256 i = 0; i < count; i++) {
            results[i] = Txt_contract(Txt_list[i + offset]).getAll();
        }
        return results;
    }

    function get_last_Txt_N(uint256 count, uint256 offset)
        public
        view
        returns (Txt_contract.TxtData[] memory)
    {
        require(
            count + offset <= Txt_list.length,
            "Count + offset out of bounds"
        );
        Txt_contract.TxtData[] memory results =
            new Txt_contract.TxtData[](count);
        uint256 len = Txt_list.length;
        for (uint256 i = 0; i < count; i++) {
            uint256 idx = len - i - offset - 1;
            results[i] = Txt_contract(Txt_list[idx]).getAll();
        }
        return results;
    }

    function get_Txt_list_length() public view returns (uint256) {
        return Txt_list.length;
    }

    function get_Txt_user_length(address user) public view returns (uint256) {
        return user_map[user].Txt_list.length;
    }

    function get_Txt_user_N(address user, uint256 index)
        public
        view
        returns (Txt_contract.TxtData memory)
    {
        return Txt_contract(user_map[user].Txt_list[index]).getAll();
    }

    function get_last_Txt_user_N(
        address user,
        uint256 count,
        uint256 offset
    ) public view returns (Txt_contract.TxtData[] memory) {
        require(
            count + offset <= user_map[user].Txt_list.length,
            "Count + offset out of bounds"
        );
        Txt_contract.TxtData[] memory results =
            new Txt_contract.TxtData[](count);
        uint256 len = user_map[user].Txt_list.length;
        for (uint256 i = 0; i < count; i++) {
            uint256 idx = len - i - offset - 1;
            results[i] = Txt_contract(user_map[user].Txt_list[idx]).getAll();
        }
        return results;
    }

    address[] public Hashtag_list;

    function get_Hashtag_N(uint256 index)
        public
        view
        returns (Hashtag_contract.HashtagData memory)
    {
        return Hashtag_contract(Hashtag_list[index]).getAll();
    }

    function get_first_Hashtag_N(uint256 count, uint256 offset)
        public
        view
        returns (Hashtag_contract.HashtagData[] memory)
    {
        require(
            offset + count <= Hashtag_list.length,
            "Offset + count out of bounds"
        );
        Hashtag_contract.HashtagData[] memory results =
            new Hashtag_contract.HashtagData[](count);
        for (uint256 i = 0; i < count; i++) {
            results[i] = Hashtag_contract(Hashtag_list[i + offset]).getAll();
        }
        return results;
    }

    function get_last_Hashtag_N(uint256 count, uint256 offset)
        public
        view
        returns (Hashtag_contract.HashtagData[] memory)
    {
        require(
            count + offset <= Hashtag_list.length,
            "Count + offset out of bounds"
        );
        Hashtag_contract.HashtagData[] memory results =
            new Hashtag_contract.HashtagData[](count);
        uint256 len = Hashtag_list.length;
        for (uint256 i = 0; i < count; i++) {
            uint256 idx = len - i - offset - 1;
            results[i] = Hashtag_contract(Hashtag_list[idx]).getAll();
        }
        return results;
    }

    function get_Hashtag_list_length() public view returns (uint256) {
        return Hashtag_list.length;
    }

    function get_Hashtag_user_length(address user)
        public
        view
        returns (uint256)
    {
        return user_map[user].Hashtag_list.length;
    }

    function get_Hashtag_user_N(address user, uint256 index)
        public
        view
        returns (Hashtag_contract.HashtagData memory)
    {
        return Hashtag_contract(user_map[user].Hashtag_list[index]).getAll();
    }

    function get_last_Hashtag_user_N(
        address user,
        uint256 count,
        uint256 offset
    ) public view returns (Hashtag_contract.HashtagData[] memory) {
        require(
            count + offset <= user_map[user].Hashtag_list.length,
            "Count + offset out of bounds"
        );
        Hashtag_contract.HashtagData[] memory results =
            new Hashtag_contract.HashtagData[](count);
        uint256 len = user_map[user].Hashtag_list.length;
        for (uint256 i = 0; i < count; i++) {
            uint256 idx = len - i - offset - 1;
            results[i] = Hashtag_contract(user_map[user].Hashtag_list[idx])
                .getAll();
        }
        return results;
    }

    struct Txt_Hashtag {
        bool exists;
        address[] Txt_list;
    }
    mapping(address => Txt_Hashtag) public Txt_Hashtag_map;

    function get_length_Txt_Hashtag_map(address hash)
        public
        view
        returns (uint256)
    {
        return Txt_Hashtag_map[hash].Txt_list.length;
    }

    function get_last_Txt_Hashtag_map_N(
        address hash,
        uint256 count,
        uint256 offset
    ) public view returns (Txt_contract.TxtData[] memory) {
        Txt_contract.TxtData[] memory results =
            new Txt_contract.TxtData[](count);
        for (uint256 i = 0; i < count; i++) {
            Txt_contract instance =
                Txt_contract(
                    Txt_Hashtag_map[hash].Txt_list[
                        Txt_Hashtag_map[hash].Txt_list.length - i - offset - 1
                    ]
                );
            results[i] = instance.getAll();
        }
        return results;
    }

    struct UserInfo {
        address owner;
        bool exists;
        address[] Txt_list;
        uint256 Txt_list_length;
        address[] Hashtag_list;
        uint256 Hashtag_list_length;
    }
    mapping(address => UserInfo) public user_map;
    address[] public UserInfoList;
    uint256 public UserInfoListLength;

    event NewTxt(address indexed sender, address indexed contractAddress);

    function new_Txt(string memory message, address Hashtag)
        public
        returns (address)
    {
        address mynew =
            address(new Txt_contract({_message: message, _Hashtag: Hashtag}));

        if (!Txt_Hashtag_map[Hashtag].exists) {
            Txt_Hashtag_map[Hashtag] = create_index_on_new_Txt_Hashtag();
        }
        Txt_Hashtag_map[Hashtag].Txt_list.push(mynew);

        if (!user_map[msg.sender].exists) {
            user_map[msg.sender] = create_user_on_new_Txt(mynew);
        }
        user_map[msg.sender].Txt_list.push(mynew);
        user_map[msg.sender].Txt_list_length += 1;

        Txt_list.push(mynew);
        // The length of Txt_list is tracked by the array length

        emit NewTxt(msg.sender, mynew);

        return mynew;
    }

    function create_user_on_new_Txt(address addr)
        private
        returns (UserInfo memory)
    {
        address[] memory Txt_list_ = new address[](0);
        address[] memory Hashtag_list_ = new address[](0);
        UserInfoList.push(addr);
        return
            UserInfo({
                exists: true,
                owner: addr,
                Txt_list: Txt_list_,
                Txt_list_length: 0,
                Hashtag_list: Hashtag_list_,
                Hashtag_list_length: 0
            });
    }

    function create_index_on_new_Txt_Hashtag()
        private
        pure
        returns (Txt_Hashtag memory)
    {
        address[] memory tmp = new address[](0);
        return Txt_Hashtag({exists: true, Txt_list: tmp});
    }

    event NewHashtag(address indexed sender, address indexed contractAddress);

    mapping(bytes32 => address) unique_map_tag;

    function get_unique_map_Hashtag(string memory tag)
        public
        view
        returns (address)
    {
        bytes32 hash = keccak256(abi.encodePacked(tag));
        return unique_map_tag[hash];
    }

    function new_Hashtag(string memory tag) public returns (address) {
        bytes32 hash_tag = keccak256(abi.encodePacked(tag));
        require(
            unique_map_tag[hash_tag] == address(0),
            "Unique constraint violation for tag"
        );
        address mynew = address(new Hashtag_contract({_tag: tag}));

        unique_map_tag[hash_tag] = mynew;

        if (!user_map[msg.sender].exists) {
            user_map[msg.sender] = create_user_on_new_Hashtag(mynew);
        }
        user_map[msg.sender].Hashtag_list.push(mynew);
        user_map[msg.sender].Hashtag_list_length += 1;

        Hashtag_list.push(mynew);
        // The length of Hashtag_list is tracked by the array length

        emit NewHashtag(msg.sender, mynew);

        return mynew;
    }

    function create_user_on_new_Hashtag(address addr)
        private
        returns (UserInfo memory)
    {
        address[] memory Txt_list_ = new address[](0);
        address[] memory Hashtag_list_ = new address[](0);
        UserInfoList.push(addr);
        return
            UserInfo({
                exists: true,
                owner: addr,
                Txt_list: Txt_list_,
                Txt_list_length: 0,
                Hashtag_list: Hashtag_list_,
                Hashtag_list_length: 0
            });
    }
}
