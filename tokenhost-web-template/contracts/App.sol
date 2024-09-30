// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.2;
pragma experimental ABIEncoderV2;

contract FilComments_contract {
    uint256 timestamp;
    address sender;
    string comment;
    string photo;
    address topic;

    constructor(
        string memory _comment,
        string memory _photo,
        address _topic
    ) {
        sender = tx.origin;
        timestamp = block.timestamp;
        comment = _comment;
        photo = _photo;
        topic = _topic;
    }

    function getAll()
        public
        view
        returns (
            address,
            uint256,
            address,
            string memory,
            string memory,
            address
        )
    {
        return (address(this), timestamp, sender, comment, photo, topic);
    }

    function get_timestamp() public view returns (uint256) {
        return timestamp;
    }

    function get_sender() public view returns (address) {
        return sender;
    }

    function get_comment() public view returns (string memory) {
        return comment;
    }

    function get_photo() public view returns (string memory) {
        return photo;
    }

    function get_topic() public view returns (address) {
        return topic;
    }
}

contract Topics_contract {
    uint256 timestamp;
    address sender;
    string name;

    constructor(string memory _name) {
        sender = tx.origin;
        timestamp = block.timestamp;
        name = _name;
    }

    function getAll()
        public
        view
        returns (
            address,
            uint256,
            address,
            string memory
        )
    {
        return (address(this), timestamp, sender, name);
    }

    function get_timestamp() public view returns (uint256) {
        return timestamp;
    }

    function get_sender() public view returns (address) {
        return sender;
    }

    function get_name() public view returns (string memory) {
        return name;
    }
}

contract App {
    struct UserInfo {
        address owner;
        bool exists;
        address[] FilComments_list;
        uint256 FilComments_list_length;
        address[] Topics_list;
        uint256 Topics_list_length;
    }
    mapping(address => UserInfo) public user_map;
    address[] UserInfoList;
    uint256 UserInfoListLength;

    address[] FilComments_list;
    uint256 FilComments_list_length;

    function get_FilComments_list_length() public view returns (uint256) {
        return FilComments_list_length;
    }

    struct FilComments_getter {
        address _address;
        uint256 timestamp;
        address sender;
        string comment;
        string photo;
        address topic;
    }

    function get_FilComments_N(uint256 index)
        public
        view
        returns (
            address,
            uint256,
            address,
            string,
            string,
            address
        )
    {
        return FilComments_contract(FilComments_list[index]).getAll();
    }

    function get_first_FilComments_N(uint256 count, uint256 offset)
        public
        view
        returns (FilComments_getter[] memory)
    {
        FilComments_getter[] memory getters = new FilComments_getter[](count);
        for (uint256 i = offset; i < count; i++) {
            FilComments_contract myContract =
                FilComments_contract(FilComments_list[i + offset]);
            getters[i - offset]._address = address(myContract);
            getters[i - offset].timestamp = myContract.get_timestamp();
            getters[i - offset].sender = myContract.get_sender();
            getters[i - offset].comment = myContract.get_comment();
            getters[i - offset].photo = myContract.get_photo();
            getters[i - offset].topic = myContract.get_topic();
        }
        return getters;
    }

    function get_last_FilComments_N(uint256 count, uint256 offset)
        public
        view
        returns (FilComments_getter[] memory)
    {
        FilComments_getter[] memory getters = new FilComments_getter[](count);
        for (uint256 i = 0; i < count; i++) {
            FilComments_contract myContract =
                FilComments_contract(
                    FilComments_list[FilComments_list_length - i - offset - 1]
                );
            getters[i]._address = address(myContract);
            getters[i].timestamp = myContract.get_timestamp();
            getters[i].sender = myContract.get_sender();
            getters[i].comment = myContract.get_comment();
            getters[i].photo = myContract.get_photo();
            getters[i].topic = myContract.get_topic();
        }
        return getters;
    }

    function get_FilComments_user_length(address user)
        public
        view
        returns (uint256)
    {
        return user_map[user].FilComments_list_length;
    }

    function get_FilComments_user_N(address user, uint256 index)
        public
        view
        returns (
            address,
            uint256,
            address,
            string,
            string,
            address
        )
    {
        return
            FilComments_contract(user_map[user].FilComments_list[index])
                .getAll();
    }

    function get_last_FilComments_user_N(
        address user,
        uint256 count,
        uint256 offset
    ) public view returns (FilComments_getter[] memory) {
        FilComments_getter[] memory getters = new FilComments_getter[](count);
        for (uint256 i = offset; i < count; i++) {
            getters[i - offset]._address = user_map[user].FilComments_list[
                i + offset
            ];
            getters[i - offset].timestamp = FilComments_contract(
                user_map[user].FilComments_list[i + offset]
            )
                .get_timestamp();
            getters[i - offset].sender = FilComments_contract(
                user_map[user].FilComments_list[i + offset]
            )
                .get_sender();
            getters[i - offset].comment = FilComments_contract(
                user_map[user].FilComments_list[i + offset]
            )
                .get_comment();
            getters[i - offset].photo = FilComments_contract(
                user_map[user].FilComments_list[i + offset]
            )
                .get_photo();
            getters[i - offset].topic = FilComments_contract(
                user_map[user].FilComments_list[i + offset]
            )
                .get_topic();
        }
        return getters;
    }

    struct FilComments_Topics {
        bool exists;
        address[] FilComments_list;
    }
    mapping(address => FilComments_Topics) public FilComments_Topics_map;

    function get_length_FilComments_Topics_map(address key)
        public
        view
        returns (uint256)
    {
        return FilComments_Topics_map[key].FilComments_list.length;
    }

    function get_last_FilComments_Topics_map_N(
        address key,
        uint256 count,
        uint256 offset
    ) public view returns (FilComments_getter[] memory) {
        FilComments_getter[] memory getters = new FilComments_getter[](count);
        for (uint256 i = 0; i < count; i++) {
            FilComments_contract myContract =
                FilComments_contract(
                    FilComments_Topics_map[key].FilComments_list[
                        FilComments_Topics_map[key].FilComments_list.length -
                            i -
                            offset -
                            1
                    ]
                );
            getters[i]._address = address(myContract);
            getters[i].timestamp = myContract.get_timestamp();
            getters[i].sender = myContract.get_sender();
            getters[i].comment = myContract.get_comment();
            getters[i].photo = myContract.get_photo();
            getters[i].topic = myContract.get_topic();
        }
        return getters;
    }

    event NewFilComments(address sender);

    function new_FilComments(
        string memory comment,
        string memory photo,
        address topic
    ) public returns (address) {
        address newContract =
            address(
                new FilComments_contract({
                    _comment: comment,
                    _photo: photo,
                    _topic: topic
                })
            );
        if (!FilComments_Topics_map[topic].exists) {
            FilComments_Topics_map[
                topic
            ] = createIndexOnNewFilComments_Topics();
        }
        FilComments_Topics_map[topic].FilComments_list.push(newContract);
        if (!user_map[msg.sender].exists) {
            user_map[msg.sender] = createUserOnNewFilComments(newContract);
        }
        user_map[msg.sender].FilComments_list.push(newContract);
        user_map[msg.sender].FilComments_list_length++;
        FilComments_list.push(newContract);
        FilComments_list_length++;
        emit NewFilComments(msg.sender);
        return newContract;
    }

    function createUserOnNewFilComments(address addr)
        private
        returns (UserInfo memory)
    {
        address[] memory FilComments_list_;
        address[] memory Topics_list_;
        UserInfoList.push(addr);
        return
            UserInfo({
                exists: true,
                owner: addr,
                FilComments_list: FilComments_list_,
                FilComments_list_length: 0,
                Topics_list: Topics_list_,
                Topics_list_length: 0
            });
    }

    function createIndexOnNewFilComments_Topics()
        private
        pure
        returns (FilComments_Topics memory)
    {
        address[] memory temp;
        return FilComments_Topics({exists: true, FilComments_list: temp});
    }

    address[] Topics_list;
    uint256 Topics_list_length;

    function get_Topics_list_length() public view returns (uint256) {
        return Topics_list_length;
    }

    struct Topics_getter {
        address _address;
        uint256 timestamp;
        address sender;
        string name;
    }

    function get_Topics_N(uint256 index)
        public
        view
        returns (
            address,
            uint256,
            address,
            string
        )
    {
        return Topics_contract(Topics_list[index]).getAll();
    }

    function get_first_Topics_N(uint256 count, uint256 offset)
        public
        view
        returns (Topics_getter[] memory)
    {
        Topics_getter[] memory getters = new Topics_getter[](count);
        for (uint256 i = offset; i < count; i++) {
            Topics_contract myContract =
                Topics_contract(Topics_list[i + offset]);
            getters[i - offset]._address = address(myContract);
            getters[i - offset].timestamp = myContract.get_timestamp();
            getters[i - offset].sender = myContract.get_sender();
            getters[i - offset].name = myContract.get_name();
        }
        return getters;
    }

    function get_last_Topics_N(uint256 count, uint256 offset)
        public
        view
        returns (Topics_getter[] memory)
    {
        Topics_getter[] memory getters = new Topics_getter[](count);
        for (uint256 i = 0; i < count; i++) {
            Topics_contract myContract =
                Topics_contract(
                    Topics_list[Topics_list_length - i - offset - 1]
                );
            getters[i]._address = address(myContract);
            getters[i].timestamp = myContract.get_timestamp();
            getters[i].sender = myContract.get_sender();
            getters[i].name = myContract.get_name();
        }
        return getters;
    }

    function get_Topics_user_length(address user)
        public
        view
        returns (uint256)
    {
        return user_map[user].Topics_list_length;
    }

    function get_Topics_user_N(address user, uint256 index)
        public
        view
        returns (
            address,
            uint256,
            address,
            string
        )
    {
        return Topics_contract(user_map[user].Topics_list[index]).getAll();
    }

    function get_last_Topics_user_N(
        address user,
        uint256 count,
        uint256 offset
    ) public view returns (Topics_getter[] memory) {
        Topics_getter[] memory getters = new Topics_getter[](count);
        for (uint256 i = offset; i < count; i++) {
            getters[i - offset]._address = user_map[user].Topics_list[
                i + offset
            ];
            getters[i - offset].timestamp = Topics_contract(
                user_map[user].Topics_list[i + offset]
            )
                .get_timestamp();
            getters[i - offset].sender = Topics_contract(
                user_map[user].Topics_list[i + offset]
            )
                .get_sender();
            getters[i - offset].name = Topics_contract(
                user_map[user].Topics_list[i + offset]
            )
                .get_name();
        }
        return getters;
    }

    event NewTopics(address sender);
    mapping(bytes32 => address) unique_map_Topics;

    function get_unique_map_Topics(string memory name)
        public
        view
        returns (address)
    {
        bytes32 hash = keccak256(abi.encodePacked(name));
        return unique_map_Topics[hash];
    }

    function new_Topics(string memory name) public returns (address) {
        bytes32 hash = keccak256(abi.encodePacked(name));
        require(unique_map_Topics[hash] == address(0), "Duplicate entry");
        address newContract = address(new Topics_contract({_name: name}));
        unique_map_Topics[hash] = newContract;
        if (!user_map[msg.sender].exists) {
            user_map[msg.sender] = createUserOnNewTopics(newContract);
        }
        user_map[msg.sender].Topics_list.push(newContract);
        user_map[msg.sender].Topics_list_length++;
        Topics_list.push(newContract);
        Topics_list_length++;
        emit NewTopics(msg.sender);
        return newContract;
    }

    function createUserOnNewTopics(address addr)
        private
        returns (UserInfo memory)
    {
        address[] memory FilComments_list_;
        address[] memory Topics_list_;
        UserInfoList.push(addr);
        return
            UserInfo({
                exists: true,
                owner: addr,
                FilComments_list: FilComments_list_,
                FilComments_list_length: 0,
                Topics_list: Topics_list_,
                Topics_list_length: 0
            });
    }
}
